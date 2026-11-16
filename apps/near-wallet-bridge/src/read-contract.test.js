import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTRACT_ACCOUNT_ID,
  EXPECTED_OWNER_ID,
  ISSUER_ID_TO_CHECK,
  readRegistryStatus,
} from "./read-contract.js";

function jsonResponse(result) {
  return { ok: true, json: async () => ({ jsonrpc: "2.0", result }) };
}

test("pins the deployed Testnet contract and expected issuer", () => {
  assert.equal(CONTRACT_ACCOUNT_ID, "registry.wkams.testnet");
  assert.equal(EXPECTED_OWNER_ID, "wkams.testnet");
  assert.equal(ISSUER_ID_TO_CHECK, "issuer.testnet");
});

test("reads account, owner, and issuer record without signing or sending transactions", async () => {
  const calls = [];
  const fetchMock = async (_url, options) => {
    const request = JSON.parse(options.body);
    calls.push(request);
    if (request.params.request_type === "view_account") {
      return jsonResponse({ code_hash: "A".repeat(44), block_height: 123 });
    }
    const bytes = Uint8Array.from(atob(request.params.args_base64), (c) => c.charCodeAt(0));
    const args = JSON.parse(new TextDecoder().decode(bytes));
    const value = request.params.method_name === "get_owner"
      ? EXPECTED_OWNER_ID
      : args.issuer_id === ISSUER_ID_TO_CHECK ? null : null;
    const encoded = new TextEncoder().encode(JSON.stringify(value));
    return jsonResponse({ result: Array.from(encoded) });
  };

  const result = await readRegistryStatus(fetchMock);
  assert.equal(result.owner, EXPECTED_OWNER_ID);
  assert.equal(result.ownerMatches, true);
  assert.equal(result.issuer, null);
  assert.equal(result.issuerRegistered, false);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((call) => call.method === "query"));
});

test("fails closed when the account has no deployed contract code", async () => {
  const fetchMock = async () => jsonResponse({
    code_hash: "11111111111111111111111111111111",
    block_height: 123,
  });
  await assert.rejects(() => readRegistryStatus(fetchMock), /no deployed code/i);
});

test("fails closed on a mismatched owner", async () => {
  const fetchMock = async (_url, options) => {
    const request = JSON.parse(options.body);
    if (request.params.request_type === "view_account") {
      return jsonResponse({ code_hash: "A".repeat(44), block_height: 123 });
    }
    const value = request.params.method_name === "get_owner" ? "attacker.testnet" : null;
    return jsonResponse({ result: Array.from(new TextEncoder().encode(JSON.stringify(value))) });
  };
  const result = await readRegistryStatus(fetchMock);
  assert.equal(result.ownerMatches, false);
});
