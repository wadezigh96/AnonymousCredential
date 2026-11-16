export const CONTRACT_ACCOUNT_ID = "registry.wkams.testnet";
export const EXPECTED_OWNER_ID = "wkams.testnet";
export const ISSUER_ID_TO_CHECK = "wkams.testnet";
export const NEAR_TESTNET_RPC = "https://rpc.testnet.near.org";
const EMPTY_CODE_HASH = "11111111111111111111111111111111";

function encodeArgs(args) {
  const bytes = new TextEncoder().encode(JSON.stringify(args));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeResult(bytes) {
  const binary = atob(bytes);
  const data = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(data));
}

async function rpcQuery(fetchImpl, params, id) {
  const response = await fetchImpl(NEAR_TESTNET_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "query", params }),
  });
  if (!response.ok) throw new Error(`NEAR RPC HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || "NEAR RPC query failed");
  if (!payload.result) throw new Error("NEAR RPC returned no result");
  return payload.result;
}

async function viewCall(fetchImpl, methodName, args = {}) {
  const result = await rpcQuery(fetchImpl, {
    request_type: "call_function",
    finality: "final",
    account_id: CONTRACT_ACCOUNT_ID,
    method_name: methodName,
    args_base64: encodeArgs(args),
  }, `anonymesh-${methodName}`);
  if (typeof result.result === "undefined") throw new Error(`Missing result for ${methodName}`);
  return decodeResult(result.result);
}

export async function readRegistryStatus(fetchImpl = fetch) {
  const account = await rpcQuery(fetchImpl, {
    request_type: "view_account",
    finality: "final",
    account_id: CONTRACT_ACCOUNT_ID,
  }, "anonymesh-view-account");

  if (account.code_hash === EMPTY_CODE_HASH) {
    throw new Error("Contract account exists but has no deployed code.");
  }

  const [owner, issuer] = await Promise.all([
    viewCall(fetchImpl, "get_owner"),
    viewCall(fetchImpl, "get_issuer", { issuer_id: ISSUER_ID_TO_CHECK }),
  ]);

  return {
    accountId: CONTRACT_ACCOUNT_ID,
    codeHash: account.code_hash,
    owner,
    ownerMatches: owner === EXPECTED_OWNER_ID,
    issuerId: ISSUER_ID_TO_CHECK,
    issuer,
    issuerRegistered: issuer !== null,
    blockHeight: account.block_height,
  };
}
