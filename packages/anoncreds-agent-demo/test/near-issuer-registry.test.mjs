import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { nodeEd25519PublicKeyToNear } from "../src/near-key-format.mjs";
import { createNearIssuerRegistryClient, IssuerRegistryUnavailableError } from "../src/near-issuer-registry.mjs";

const key = generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" }).x;
const config = { network: "local", contractAccount: "registry.testnet", rpcUrl: "http://127.0.0.1:3030", issuerAccount: "issuer.testnet", expectedKeyVersion: 1, expectedSchemaHash: "a".repeat(64), minimumStatusEpoch: 0 };
const record = { public_key: nodeEd25519PublicKeyToNear(key), key_version: 1, schema_hash: "a".repeat(64), active: true, status_epoch: 0, status_root: "0".repeat(64) };
function response(value, { ok = true, status = ok ? 200 : 400 } = {}) {
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(bytes)); controller.close(); } });
  return { ok, status, headers: new Headers({ "content-length": String(bytes.byteLength) }), body };
}
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

test("does not let stale cache mask fresh key-version or schema mismatches", async () => {
  for (const [field, value, expectedCode] of [
    ["key_version", 2, "KEY_VERSION_MISMATCH"],
    ["schema_hash", "b".repeat(64), "SCHEMA_HASH_MISMATCH"],
  ]) {
    let now = 1_000;
    let current = record;
    const client = createNearIssuerRegistryClient({
      ...config,
      cacheTtlMs: 0,
      maxStaleMs: 10_000,
      now: () => now,
      fetchImpl: async () => response({ result: { result: Array.from(Buffer.from(JSON.stringify(current), "utf8")) } }),
    });
    await client.getIssuerRecord();
    now += 1;
    current = { ...record, [field]: value };
    await assert.rejects(client.getIssuerRecord(), error => error.code === expectedCode);
  }
});

test("serves stale cache only for an availability failure within the age bound", async () => {
  let now = 1_000;
  let calls = 0;
  const client = createNearIssuerRegistryClient({
    ...config,
    cacheTtlMs: 0,
    maxStaleMs: 250,
    now: () => now,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return response({ result: { result: Array.from(Buffer.from(JSON.stringify(record), "utf8")) } });
      now += 300;
      throw new TypeError("network unavailable");
    },
  });
  await client.getIssuerRecord();
  now += 1;
  await assert.rejects(client.getIssuerRecord(), error => error.code === "RPC_NETWORK_ERROR");
});

test("uses stale cache for transient HTTP statuses but not other client errors", async () => {
  for (const [status, shouldFallback] of [[408, true], [429, true], [503, true], [401, false]]) {
    let now = 1_000;
    let calls = 0;
    const client = createNearIssuerRegistryClient({
      ...config,
      cacheTtlMs: 0,
      maxStaleMs: 1_000,
      now: () => now,
      fetchImpl: async () => {
        calls += 1;
        return calls === 1
          ? response({ result: { result: Array.from(Buffer.from(JSON.stringify(record), "utf8")) } })
          : response({ error: "registry response" }, { ok: false, status });
      },
    });
    const cached = await client.getIssuerRecord();
    now += 1;
    if (shouldFallback) assert.equal(await client.getIssuerRecord(), cached);
    else await assert.rejects(client.getIssuerRecord(), error => error.code === "RPC_HTTP_ERROR");
  }
});

test("enforces the response byte limit while streaming even with missing or understated Content-Length", async () => {
  for (const contentLength of [null, "1"]) {
    let arrayBufferCalled = false;
    let cancelled = false;
    let pulls = 0;
    const chunks = [Buffer.alloc(700), Buffer.alloc(700), Buffer.alloc(700)];
    const stream = new ReadableStream({
      pull(controller) {
        if (pulls < chunks.length) controller.enqueue(new Uint8Array(chunks[pulls++]));
        else controller.close();
      },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    const headers = new Headers(contentLength === null ? {} : { "content-length": contentLength });
    const client = createNearIssuerRegistryClient({
      ...config,
      maxResponseBytes: 1024,
      fetchImpl: async () => ({
        ok: true,
        headers,
        body: stream,
        async arrayBuffer() {
          arrayBufferCalled = true;
          return Buffer.concat(chunks);
        },
      }),
    });
    await assert.rejects(client.getIssuerRecord(), error => error.code === "RPC_RESPONSE_TOO_LARGE");
    assert.equal(arrayBufferCalled, false, "must not buffer the full response with arrayBuffer()");
    assert.equal(cancelled, true, "must cancel the stream as soon as the byte limit is exceeded");
    assert.ok(pulls < chunks.length, "must stop reading before consuming the full oversized response");
  }
});

test("cancels the response body immediately when declared Content-Length exceeds the limit", async () => {
  let cancelled = false;
  let pulls = 0;
  const body = new ReadableStream({
    pull() { pulls += 1; },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const client = createNearIssuerRegistryClient({
    ...config,
    maxResponseBytes: 1024,
    fetchImpl: async () => ({
      ok: true,
      headers: new Headers({ "content-length": "2048" }),
      body,
    }),
  });
  await assert.rejects(client.getIssuerRecord(), error => error.code === "RPC_RESPONSE_TOO_LARGE");
  assert.equal(cancelled, true);
  assert.equal(pulls, 0, "must reject and cancel without reading the body");
});


test("does not reuse cache when TTL is zero, even within the same millisecond", async () => {
  let calls = 0;
  const client = createNearIssuerRegistryClient({
    ...config,
    cacheTtlMs: 0,
    maxStaleMs: 0,
    now: () => 1_000,
    fetchImpl: async () => {
      calls += 1;
      return response({
        result: {
          result: Array.from(Buffer.from(JSON.stringify(record), "utf8")),
        },
      });
    },
  });

  await client.getIssuerRecord();
  await client.getIssuerRecord();

  assert.equal(calls, 2, "zero TTL must require a fresh RPC read every time");
});
