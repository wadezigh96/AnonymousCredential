import {
  chmodSync,
  existsSync,
  renameSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  closeSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname, basename, join } from "node:path";
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
} from "node:crypto";

const MODE = 0o600;
const FORMAT_VERSION = 1;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function checkFile(file) {
  if (typeof file !== "string" || !file || file.includes("\0")) {
    fail("INVALID_ISSUER_STATE_FILE");
  }
}

function publicX(privateKey) {
  return createPublicKey(privateKey).export({ format: "jwk" }).x;
}

function validateConfig(config, registryPublicKey) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    fail("ISSUER_STATE_CONFIG_INVALID");
  }

  for (const field of [
    "schema",
    "credentialDefinition",
    "credentialDefinitionPrivate",
    "offer",
  ]) {
    if (!config[field] || typeof config[field] !== "object") {
      fail("ISSUER_STATE_CONFIG_INVALID");
    }
  }

  if (config.issuerRegistryPublicKey !== registryPublicKey) {
    fail("ISSUER_STATE_REGISTRY_KEY_MISMATCH");
  }
}

function checkStateDirectory(directory, strictPermissions) {
  let stat;

  try {
    stat = lstatSync(directory);
  } catch {
    fail("ISSUER_STATE_DIRECTORY_INVALID");
  }

  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail("ISSUER_STATE_DIRECTORY_INVALID");
  }

  if (strictPermissions && (stat.mode & 0o077) !== 0) {
    fail("INSECURE_ISSUER_STATE_DIRECTORY_PERMISSIONS");
  }
}

function readState({
  file,
  issuerKeyVersion,
  issuerRegistryPublicKey,
  strictPermissions,
}) {
  try {
    const stat = lstatSync(file);

    if (!stat.isFile() || stat.isSymbolicLink()) {
      fail("ISSUER_STATE_NOT_REGULAR_FILE");
    }

    if ((stat.mode & 0o077) !== 0) {
      if (strictPermissions) {
        fail("INSECURE_ISSUER_STATE_PERMISSIONS");
      }
      chmodSync(file, MODE);
    }

    const parsed = JSON.parse(readFileSync(file, "utf8"));

    if (
      parsed.formatVersion !== FORMAT_VERSION ||
      parsed.issuerKeyVersion !== issuerKeyVersion
    ) {
      fail("ISSUER_STATE_VERSION_MISMATCH");
    }

    if (parsed.issuerRegistryPublicKey !== issuerRegistryPublicKey) {
      fail("ISSUER_STATE_REGISTRY_KEY_MISMATCH");
    }

    validateConfig(parsed.config, issuerRegistryPublicKey);

    const privateKey = createPrivateKey({
      key: parsed.authorizationRoot?.privateKey,
      format: "jwk",
    });

    if (privateKey.asymmetricKeyType !== "ed25519") {
      fail("ISSUER_STATE_AUTHORIZATION_KEY_INVALID");
    }

    const derivedPublicKey = publicX(privateKey);

    if (
      typeof parsed.authorizationRoot.publicKey !== "string" ||
      derivedPublicKey !== parsed.authorizationRoot.publicKey
    ) {
      fail("ISSUER_STATE_AUTHORIZATION_KEY_MISMATCH");
    }

    return Object.freeze({
      config: parsed.config,
      authorizationRoot: Object.freeze({
        privateKey,
        publicKey: derivedPublicKey,
      }),
      issuerKeyVersion,
      issuerRegistryPublicKey,
    });
  } catch (error) {
    if (error.code?.startsWith("ISSUER_STATE") ||
        error.code?.startsWith("INSECURE_")) {
      throw error;
    }
    fail("ISSUER_STATE_MALFORMED");
  }
}

export function loadOrCreateIssuerState({
  file,
  issuerKeyVersion = 1,
  issuerRegistryPublicKey,
  createConfig,
  allowCreate = false,
  strictPermissions = true,
} = {}) {
  checkFile(file);

  if (!Number.isSafeInteger(issuerKeyVersion) || issuerKeyVersion < 1) {
    fail("INVALID_ISSUER_STATE_VERSION");
  }

  if (
    typeof issuerRegistryPublicKey !== "string" ||
    !issuerRegistryPublicKey
  ) {
    fail("INVALID_ISSUER_STATE_REGISTRY_KEY");
  }

  if (existsSync(file)) {
    checkStateDirectory(dirname(file), strictPermissions);
    return readState({
      file,
      issuerKeyVersion,
      issuerRegistryPublicKey,
      strictPermissions,
    });
  }

  if (!allowCreate) {
    fail("ISSUER_STATE_MISSING");
  }

  if (typeof createConfig !== "function") {
    fail("ISSUER_STATE_CREATOR_REQUIRED");
  }

  const config = createConfig();
  validateConfig(config, issuerRegistryPublicKey);

  const { privateKey } = generateKeyPairSync("ed25519");
  const authorizationRoot = {
    privateKey: privateKey.export({ format: "jwk" }),
    publicKey: publicX(privateKey),
  };

  const record = {
    formatVersion: FORMAT_VERSION,
    issuerKeyVersion,
    issuerRegistryPublicKey,
    config,
    authorizationRoot,
  };

  const directory = dirname(file);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  checkStateDirectory(directory, strictPermissions);

  const temporaryFile = join(
    directory,
    `.${basename(file)}.${process.pid}.${Date.now()}.tmp`,
  );
  const lockFile = `${file}.lock`;

  let descriptor;
  let lockDescriptor;
  let ownsLock = false;

  try {
    // Exclusive lock prevents cooperating issuer processes from
    // initializing or replacing the same state simultaneously.
    lockDescriptor = openSync(lockFile, "wx", MODE);
    ownsLock = true;

    if (existsSync(file)) {
      fail("ISSUER_STATE_CREATION_RACE");
    }

    descriptor = openSync(temporaryFile, "wx", MODE);

    const contents = Buffer.from(JSON.stringify(record) + "\n", "utf8");
    let offset = 0;

    while (offset < contents.length) {
      offset += writeSync(
        descriptor,
        contents,
        offset,
        contents.length - offset,
      );
    }

    closeSync(descriptor);
    descriptor = undefined;

    // Atomic replacement within the same directory/filesystem.
    renameSync(temporaryFile, file);
    chmodSync(file, MODE);
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch {}
    }

    try { unlinkSync(temporaryFile); } catch {}

    if (
      error.code === "ISSUER_STATE_CREATION_RACE" ||
      error.code?.startsWith("ISSUER_STATE")
    ) {
      throw error;
    }

    if (error.code === "EEXIST") {
      fail("ISSUER_STATE_CREATION_RACE");
    }

    fail("ISSUER_STATE_WRITE_FAILED");
  } finally {
    if (lockDescriptor !== undefined) {
      try { closeSync(lockDescriptor); } catch {}
    }
    // Never remove a lock owned by another process.
    if (ownsLock) {
      try { unlinkSync(lockFile); } catch {}
    }
  }

  return readState({
    file,
    issuerKeyVersion,
    issuerRegistryPublicKey,
    strictPermissions: true,
  });
}
