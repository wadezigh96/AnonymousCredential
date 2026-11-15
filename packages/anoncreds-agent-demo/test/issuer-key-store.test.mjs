import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sign, verify, createPublicKey } from "node:crypto";
import { generateIssuerKeyFile, loadIssuerKey } from "../src/issuer-key-store.mjs";

test("issuer key is stable across reload and verifies signatures", () => {
  const dir = mkdtempSync(join(tmpdir(), "anonymesh-issuer-key-"));
  const file = join(dir, "issuer.json");
  try {
    const first = generateIssuerKeyFile({ file, keyVersion: 1 });
    const second = loadIssuerKey({ file, expectedKeyVersion: 1 });
    const message = Buffer.from("registry-bound-issuer");
    const signature = sign(null, message, first.privateKey);
    assert.equal(first.publicKey, second.publicKey);
    assert.equal(verify(null, message, createPublicKey(second.privateKey), signature), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("rejects missing, malformed, insecure, and version-mismatched key files", () => {
  const dir = mkdtempSync(join(tmpdir(), "anonymesh-issuer-key-"));
  const file = join(dir, "issuer.json");
  try {
    assert.throws(() => loadIssuerKey({ file, expectedKeyVersion: 1 }), error => error.code === "ISSUER_KEY_MISSING");
    generateIssuerKeyFile({ file, keyVersion: 1 });
    chmodSync(file, 0o644);
    assert.throws(() => loadIssuerKey({ file, expectedKeyVersion: 1, strictPermissions: true }), error => error.code === "INSECURE_ISSUER_KEY_PERMISSIONS");
    chmodSync(file, 0o600);
    assert.throws(() => loadIssuerKey({ file, expectedKeyVersion: 2 }), error => error.code === "ISSUER_KEY_VERSION_MISMATCH");
    rmSync(file);
    writeFileSync(file, "not-json\n", { mode: 0o600 });
    assert.throws(() => loadIssuerKey({ file, expectedKeyVersion: 1 }), error => error.code === "ISSUER_KEY_MALFORMED");
    assert.equal(readFileSync(file, "utf8").includes("PRIVATE"), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
