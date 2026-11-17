import { chmodSync, existsSync, mkdirSync, openSync, readFileSync, statSync, closeSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { generateKeyPairSync, createPrivateKey, createPublicKey } from "node:crypto";

const MODE = 0o600;
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function checkPath(file) { if (typeof file !== "string" || !file || file.includes("\0")) fail("INVALID_ISSUER_KEY_FILE"); }
function checkMode(file, strict) { const mode = statSync(file).mode & 0o777; if ((mode & 0o077) !== 0) { if (strict) fail("INSECURE_ISSUER_KEY_PERMISSIONS"); chmodSync(file, MODE); } }
function publicX(privateKey) { return createPublicKey(privateKey).export({ format: "jwk" }).x; }
export function loadIssuerKey({ file, expectedKeyVersion = 1, strictPermissions = true, allowCreate = false } = {}) {
  checkPath(file); if (!Number.isSafeInteger(expectedKeyVersion) || expectedKeyVersion < 1) fail("INVALID_ISSUER_KEY_VERSION");
  if (!existsSync(file)) { if (!allowCreate) fail("ISSUER_KEY_MISSING"); return generateIssuerKeyFile({ file, keyVersion: expectedKeyVersion }); }
  try {
    checkMode(file, strictPermissions);
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (parsed.version !== expectedKeyVersion || !parsed.key || parsed.key.kty !== "OKP" || parsed.key.crv !== "Ed25519" || typeof parsed.key.d === "undefined") fail("ISSUER_KEY_VERSION_MISMATCH");
    const privateKey = createPrivateKey({ key: parsed.key, format: "jwk" });
    if (privateKey.asymmetricKeyType !== "ed25519") fail("INVALID_ISSUER_KEY_TYPE");
    return Object.freeze({ privateKey, publicKey: publicX(privateKey), keyVersion: parsed.version });
  } catch (error) { if (error.code?.startsWith("ISSUER_KEY") || error.code?.startsWith("INSECURE")) throw error; fail("ISSUER_KEY_MALFORMED"); }
}
export function generateIssuerKeyFile({ file, keyVersion = 1 } = {}) {
  checkPath(file); if (!Number.isSafeInteger(keyVersion) || keyVersion < 1) fail("INVALID_ISSUER_KEY_VERSION");
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temp = join(dirname(file), `.${file.split("/").pop()}.${process.pid}.${Date.now()}.tmp`);
  const { privateKey } = generateKeyPairSync("ed25519");
  const jwk = privateKey.export({ format: "jwk" });
  const descriptor = JSON.stringify({ version: keyVersion, key: jwk }) + "\n";
  let fd;
  try { fd = openSync(temp, "wx", MODE); writeSync(fd, descriptor); closeSync(fd); renameSync(temp, file); chmodSync(file, MODE); }
  catch (error) { try { if (fd !== undefined) closeSync(fd); } catch {} try { unlinkSync(temp); } catch {} if (error.code === "EEXIST") fail("ISSUER_KEY_CREATION_RACE"); fail("ISSUER_KEY_WRITE_FAILED"); }
  return loadIssuerKey({ file, expectedKeyVersion: keyVersion, strictPermissions: true, allowCreate: false });
}
