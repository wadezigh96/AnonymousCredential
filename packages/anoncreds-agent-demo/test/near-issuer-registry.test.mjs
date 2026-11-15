import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { nodeEd25519PublicKeyToNear } from "../src/near-key-format.mjs";
import { createNearIssuerRegistryClient, IssuerRegistryUnavailableError } from "../src/near-issuer-registry.mjs";

const key = generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" }).x;
const config = { network: "local", contractAccount: "registry.testnet", rpcUrl: "http://127.0.0.1:3030", issuerAccount: "issuer.testnet", expectedKeyVersion: 1, expectedSchemaHash: "a".repeat(64), minimumStatusEpoch: 0 };
const record = { public_key: nodeEd25519PublicKeyToNear(key), key_version: 1, schema_hash: "a".repeat(64), active: true, status_epoch: 0, status_root: "0".repeat(64) };
function response(value, { ok = true } = {}) { const bytes = Array.from(Buffer.from(JSON.stringify(value), "utf8")); return { ok, headers: new Headers({ "content-length": String(Buffer.byteLength(JSON.stringify(value))) }), arrayBuffer: async () => Buffer.from(JSON.stringify(value)) }; }
function fetchFor(value) { return async () => response({ result: { result: Array.from(Buffer.from(JSON.stringify(value), "utf8")) } }); }

test("reads and validates a registry record", async () => {
  const client = createNearIssuerRegistryClient({ ...config, fetchImpl: fetchFor(record) });
  const result = await client.getIssuerRecord();
  assert.equal(result.issuerAccount, "issuer.testnet");
  assert.equal(result.nodePublicKey, key);
  assert.equal(result.active, true);
});

test("rejects unknown, inactive, malformed, and mismatched records", async () => {
  for (const [value, code] of [[null, "UNKNOWN_ISSUER"], [{ ...record, active: false }, "INACTIVE_ISSUER"], [{ ...record, schema_hash: "bad" }, "INVALID_SCHEMA_HASH"], [{ ...record, key_version: 2 }, "KEY_VERSION_MISMATCH"], [{ ...record, public_key: "ed25519:2" }, "INVALID_ISSUER_PUBLIC_KEY"]]) {
    const client = createNearIssuerRegistryClient({ ...config, fetchImpl: fetchFor(value) });
    await assert.rejects(client.getIssuerRecord(), error => error instanceof IssuerRegistryUnavailableError && error.code === code);
  }
});

test("fails closed on HTTP, malformed RPC, oversized response, and timeout", async () => {
  const cases = [
    async () => response({}, { ok: false }),
    async () => response({ result: {} }),
    async () => ({ ok: true, headers: new Headers({ "content-length": "999999" }), arrayBuffer: async () => Buffer.alloc(1) }),
    (url, options) => new Promise((resolve, reject) => options.signal.addEventListener("abort", () => { const error = new Error("aborted"); error.name = "AbortError"; reject(error); })),
  ];
  const expected = ["RPC_HTTP_ERROR", "RPC_MALFORMED_RESULT", "RPC_RESPONSE_TOO_LARGE", "RPC_TIMEOUT"];
  for (let i = 0; i < cases.length; i += 1) {
    const client = createNearIssuerRegistryClient({ ...config, timeoutMs: 5, fetchImpl: cases[i] });
    await assert.rejects(client.getIssuerRecord(), error => error.code === expected[i]);
  }
});

test("uses bounded cache and never serves inactive transition as stale authorization", async () => {
  let now = 1000; let calls = 0; let current = record;
  const fetchImpl = async () => { calls += 1; return response({ result: { result: Array.from(Buffer.from(JSON.stringify(current), "utf8")) } }); };
  const client = createNearIssuerRegistryClient({ ...config, cacheTtlMs: 100, maxStaleMs: 500, now: () => now, fetchImpl });
  await client.getIssuerRecord(); await client.getIssuerRecord(); assert.equal(calls, 1);
  now += 101; current = { ...record, active: false };
  await assert.rejects(client.getIssuerRecord(), error => error.code === "INACTIVE_ISSUER");
  now += 500; await assert.rejects(client.getIssuerRecord({ forceRefresh: true }), error => error.code === "INACTIVE_ISSUER");
});
