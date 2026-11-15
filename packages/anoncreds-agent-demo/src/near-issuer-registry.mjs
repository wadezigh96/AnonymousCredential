import { nearEd25519PublicKeyToNode } from "./near-key-format.mjs";

const NETWORKS = Object.freeze({
  local: /^https?:\/\//,
  testnet: /^https:\/\/rpc\.testnet\.near\.org\/?$/,
  mainnet: /^https:\/\/rpc\.mainnet\.near\.org\/?$/,
});
const ACCOUNT = /^(?!.*\.\.)(?:[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/;
const HASH = /^[0-9a-f]{64}$/;

export class IssuerRegistryUnavailableError extends Error {
  constructor(code, cause) { super(code); this.name = "IssuerRegistryUnavailableError"; this.code = code; this.cause = cause; }
}
function fail(code, cause) { throw new IssuerRegistryUnavailableError(code, cause); }
function account(value, code) { if (typeof value !== "string" || value.length > 64 || !ACCOUNT.test(value)) fail(code); return value; }
function hash(value, code) { if (typeof value !== "string" || !HASH.test(value)) fail(code); return value; }
function boundedJson(response, maxBytes) {
  const length = Number(response.headers?.get?.("content-length") ?? 0);
  if (Number.isSafeInteger(length) && length > maxBytes) fail("RPC_RESPONSE_TOO_LARGE");
  return response.arrayBuffer().then(buffer => {
    if (buffer.byteLength > maxBytes) fail("RPC_RESPONSE_TOO_LARGE");
    try { return JSON.parse(Buffer.from(buffer).toString("utf8")); } catch (error) { fail("RPC_MALFORMED_JSON", error); }
  });
}
function validateRecord(raw, expected) {
  if (raw === null) fail("UNKNOWN_ISSUER");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("MALFORMED_ISSUER_RECORD");
  const issuerAccount = account(expected.issuerAccount, "INVALID_ISSUER_ACCOUNT");
  const result = {
    issuerAccount,
    publicKey: raw.public_key,
    keyVersion: raw.key_version,
    schemaHash: raw.schema_hash,
    active: raw.active,
    statusEpoch: raw.status_epoch,
    statusRoot: raw.status_root,
  };
  account(issuerAccount, "INVALID_ISSUER_ACCOUNT");
  if (typeof result.publicKey !== "string") fail("INVALID_ISSUER_PUBLIC_KEY");
  let nodeKey;
  try { nodeKey = nearEd25519PublicKeyToNode(result.publicKey); } catch (error) { fail("INVALID_ISSUER_PUBLIC_KEY", error); }
  if (!Number.isSafeInteger(result.keyVersion) || result.keyVersion < 1) fail("INVALID_KEY_VERSION");
  if (!HASH.test(result.schemaHash)) fail("INVALID_SCHEMA_HASH");
  if (typeof result.active !== "boolean") fail("INVALID_ACTIVE_STATUS");
  if (!Number.isSafeInteger(result.statusEpoch) || result.statusEpoch < 0) fail("INVALID_STATUS_EPOCH");
  hash(result.statusRoot, "INVALID_STATUS_ROOT");
  if (expected.expectedKeyVersion !== undefined && result.keyVersion !== expected.expectedKeyVersion) fail("KEY_VERSION_MISMATCH");
  if (expected.expectedSchemaHash !== undefined && result.schemaHash !== expected.expectedSchemaHash) fail("SCHEMA_HASH_MISMATCH");
  if (expected.minimumStatusEpoch !== undefined && result.statusEpoch < expected.minimumStatusEpoch) fail("STALE_STATUS_EPOCH");
  if (!result.active) fail("INACTIVE_ISSUER");
  return Object.freeze({ ...result, nodePublicKey: nodeKey });
}

export function createNearIssuerRegistryClient({
  network = "local", contractAccount, rpcUrl, issuerAccount, expectedKeyVersion, expectedSchemaHash,
  minimumStatusEpoch, cacheTtlMs = 0, maxStaleMs = 0, fetchImpl = globalThis.fetch,
  now = () => Date.now(), timeoutMs = 5_000, maxResponseBytes = 256 * 1024,
} = {}) {
  if (!NETWORKS[network] || typeof rpcUrl !== "string" || !NETWORKS[network].test(rpcUrl)) fail("UNSUPPORTED_NETWORK");
  account(contractAccount, "INVALID_CONTRACT_ACCOUNT"); account(issuerAccount, "INVALID_ISSUER_ACCOUNT");
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl is required");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new TypeError("Invalid RPC timeout");
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1024) throw new TypeError("Invalid RPC response limit");
  let cache = null;
  const fetchRecord = async () => {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const args = Buffer.from(JSON.stringify({ issuer_id: issuerAccount }), "utf8").toString("base64");
      const response = await fetchImpl(rpcUrl, { method: "POST", signal: controller.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "anonymesh-registry", method: "query", params: { request_type: "call_function", finality: "final", account_id: contractAccount, method_name: "get_issuer", args_base64: args } }) });
      if (!response?.ok) fail("RPC_HTTP_ERROR");
      const payload = await boundedJson(response, maxResponseBytes);
      const encoded = payload?.result?.result;
      if (!Array.isArray(encoded) || encoded.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) fail("RPC_MALFORMED_RESULT");
      let record; try { record = JSON.parse(Buffer.from(encoded).toString("utf8")); } catch (error) { fail("MALFORMED_ISSUER_RECORD", error); }
      const validated = validateRecord(record, { issuerAccount, expectedKeyVersion, expectedSchemaHash, minimumStatusEpoch });
      cache = { record: validated, fetchedAt: now() };
      return validated;
    } catch (error) {
      if (error instanceof IssuerRegistryUnavailableError) throw error;
      fail(error?.name === "AbortError" ? "RPC_TIMEOUT" : "RPC_NETWORK_ERROR", error);
    } finally { clearTimeout(timer); }
  };
  return Object.freeze({
    async getIssuerRecord({ forceRefresh = false } = {}) {
      const timestamp = now();
      if (!forceRefresh && cache && timestamp - cache.fetchedAt <= cacheTtlMs) return cache.record;
      try { return await fetchRecord(); }
      catch (error) {
        if (cache && maxStaleMs > 0 && timestamp - cache.fetchedAt <= maxStaleMs && error.code !== "INACTIVE_ISSUER" && error.code !== "UNKNOWN_ISSUER") return cache.record;
        throw error;
      }
    },
  });
}

export function issuerRecordFromRpcJson(record) {
  return JSON.stringify(Array.from(Buffer.from(JSON.stringify(record), "utf8")));
}
