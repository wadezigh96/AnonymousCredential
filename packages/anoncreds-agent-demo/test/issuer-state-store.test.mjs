import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sign, verify, createPublicKey, generateKeyPairSync } from "node:crypto";

import {
  loadOrCreateIssuerState,
} from "../src/issuer-state-store.mjs";
import { nodeEd25519PublicKeyToNear } from "../src/near-key-format.mjs";


const registryKey = generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" }).x;

function config() {
  return {
    schema: { name: "test-schema" },
    credentialDefinition: { id: "test-cred-def" },
    credentialDefinitionPrivate: { secret: "test-cl-private" },
    offer: { nonce: "test-offer" },
    issuerRegistryPublicKey: registryKey,
  };
}

test("issuer state survives reload with stable CL and authorization keys", () => {
  const directory = mkdtempSync(join(tmpdir(), "anonymesh-issuer-state-"));
  const file = join(directory, "issuer.issuer-state.json");

  try {
    const first = loadOrCreateIssuerState({
      file,
      issuerKeyVersion: 1,
      issuerRegistryPublicKey: registryKey,
      createConfig: config,
      allowCreate: true,
    });

    const second = loadOrCreateIssuerState({
      file,
      issuerKeyVersion: 1,
      issuerRegistryPublicKey: registryKey,
    });

    assert.deepEqual(second.config, first.config);
    assert.equal(
      second.authorizationRoot.publicKey,
      first.authorizationRoot.publicKey,
    );

    const message = Buffer.from("anonymesh-persistent-authorization-root");
    const signature = sign(null, message, first.authorizationRoot.privateKey);

    assert.equal(
      verify(
        null,
        message,
        createPublicKey(second.authorizationRoot.privateKey),
        signature,
      ),
      true,
    );

    assert.equal(statSync(file).mode & 0o777, 0o600);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("missing state fails closed unless creation is explicitly allowed", () => {
  const directory = mkdtempSync(join(tmpdir(), "anonymesh-issuer-state-"));
  const file = join(directory, "missing.issuer-state.json");

  try {
    assert.throws(
      () => loadOrCreateIssuerState({
        file,
        issuerRegistryPublicKey: registryKey,
      }),
      error => error.code === "ISSUER_STATE_MISSING",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("state rejects registry-key and version mismatches", () => {
  const directory = mkdtempSync(join(tmpdir(), "anonymesh-issuer-state-"));
  const file = join(directory, "issuer.issuer-state.json");

  try {
    loadOrCreateIssuerState({
      file,
      issuerKeyVersion: 1,
      issuerRegistryPublicKey: registryKey,
      createConfig: config,
      allowCreate: true,
    });

    assert.throws(
      () => loadOrCreateIssuerState({
        file,
        issuerKeyVersion: 2,
        issuerRegistryPublicKey: registryKey,
      }),
      error => error.code === "ISSUER_STATE_VERSION_MISMATCH",
    );

    assert.throws(
      () => loadOrCreateIssuerState({
        file,
        issuerKeyVersion: 1,
        issuerRegistryPublicKey: generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" }).x,
      }),
      error => error.code === "ISSUER_STATE_REGISTRY_KEY_MISMATCH",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("state rejects insecure permissions in strict mode", () => {
  const directory = mkdtempSync(join(tmpdir(), "anonymesh-issuer-state-"));
  const file = join(directory, "issuer.issuer-state.json");

  try {
    loadOrCreateIssuerState({
      file,
      issuerRegistryPublicKey: registryKey,
      createConfig: config,
      allowCreate: true,
    });

    chmodSync(file, 0o644);

    assert.throws(
      () => loadOrCreateIssuerState({
        file,
        issuerRegistryPublicKey: registryKey,
        strictPermissions: true,
      }),
      error => error.code === "INSECURE_ISSUER_STATE_PERMISSIONS",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("strict mode rejects an issuer state directory accessible by other users", () => {
  const directory = mkdtempSync(join(tmpdir(), "anonymesh-insecure-dir-"));
  const file = join(directory, "issuer-state.json");

  try {
    chmodSync(directory, 0o755);

    assert.throws(
      () => loadOrCreateIssuerState({
        file,
        issuerRegistryPublicKey: registryKey,
        createConfig: config,
        allowCreate: true,
        strictPermissions: true,
      }),
      error => error.code === "INSECURE_ISSUER_STATE_DIRECTORY_PERMISSIONS",
    );

    assert.equal(existsSync(file), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("failed lock acquisition never removes another process lock", () => {
  const directory = mkdtempSync(join(tmpdir(), "anonymesh-issuer-lock-"));
  const file = join(directory, "issuer-state.json");
  const lockFile = file + ".lock";

  try {
    writeFileSync(lockFile, "owned-by-another-process", { mode: 0o600 });

    assert.throws(
      () => loadOrCreateIssuerState({
        file,
        issuerRegistryPublicKey: registryKey,
        createConfig: config,
        allowCreate: true,
      }),
      error => error.code === "ISSUER_STATE_CREATION_RACE",
    );

    assert.equal(existsSync(lockFile), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("legacy Node issuer state loads with equivalent NEAR key without rewriting disk", () => {
  const directory = mkdtempSync(join(tmpdir(), "anonymesh-key-compat-"));
  const file = join(directory, "issuer-state.json");

  try {
    const oldNodeKey = generateKeyPairSync("ed25519")
      .publicKey.export({ format: "jwk" }).x;
    const equivalentNearKey = nodeEd25519PublicKeyToNear(oldNodeKey);

    loadOrCreateIssuerState({
      file,
      issuerKeyVersion: 1,
      issuerRegistryPublicKey: oldNodeKey,
      createConfig: () => ({
        ...config(),
        issuerRegistryPublicKey: oldNodeKey,
      }),
      allowCreate: true,
    });

    const originalFile = readFileSync(file);

    const loaded = loadOrCreateIssuerState({
      file,
      issuerKeyVersion: 1,
      issuerRegistryPublicKey: equivalentNearKey,
    });

    assert.equal(
      loaded.config.issuerRegistryPublicKey,
      equivalentNearKey,
    );
    assert.deepEqual(readFileSync(file), originalFile);

    const differentKey = generateKeyPairSync("ed25519")
      .publicKey.export({ format: "jwk" }).x;

    assert.throws(
      () => loadOrCreateIssuerState({
        file,
        issuerKeyVersion: 1,
        issuerRegistryPublicKey: differentKey,
      }),
      error => error.code === "ISSUER_STATE_REGISTRY_KEY_MISMATCH",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});


test("rejects opaque issuer registry keys", () => {
  const directory = mkdtempSync(join(tmpdir(), "anonymesh-invalid-registry-key-"));
  const file = join(directory, "issuer-state.json");

  try {
    assert.throws(
      () => loadOrCreateIssuerState({
        file,
        issuerKeyVersion: 1,
        issuerRegistryPublicKey: "not-an-ed25519-key",
        createConfig: () => config(),
        allowCreate: true,
      }),
      error => error.code === "INVALID_ISSUER_STATE_REGISTRY_KEY",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});


test("rejects persisted issuer state with an opaque registry key", () => {
  const directory = mkdtempSync(join(tmpdir(), "anonymesh-invalid-state-key-"));
  const file = join(directory, "issuer-state.json");

  try {
    const validKey = generateKeyPairSync("ed25519")
      .publicKey.export({ format: "jwk" }).x;

    loadOrCreateIssuerState({
      file,
      issuerKeyVersion: 1,
      issuerRegistryPublicKey: validKey,
      createConfig: () => ({
        ...config(),
        issuerRegistryPublicKey: validKey,
      }),
      allowCreate: true,
    });

    const saved = JSON.parse(readFileSync(file, "utf8"));
    saved.issuerRegistryPublicKey = "opaque-invalid-key";
    writeFileSync(file, JSON.stringify(saved));

    assert.throws(
      () => loadOrCreateIssuerState({
        file,
        issuerKeyVersion: 1,
        issuerRegistryPublicKey: validKey,
      }),
      error => error.code === "ISSUER_STATE_REGISTRY_KEY_MISMATCH",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
