import test from "node:test";
import assert from "node:assert/strict";
import { inspectAccount, EXPECTED_ACCOUNT_ID } from "./account-check.js";

test("accepts only the exact configured Testnet account", () => {
  assert.deepEqual(inspectAccount("wkams.testnet"), {
    connected: true,
    matchesExpected: true,
    accountId: "wkams.testnet",
  });
});

test("does not accept another account as the deployment signer", () => {
  const result = inspectAccount("someone-else.testnet");
  assert.equal(result.connected, true);
  assert.equal(result.matchesExpected, false);
});

test("rejects missing or blank account identifiers", () => {
  assert.equal(inspectAccount(undefined).connected, false);
  assert.equal(inspectAccount("  ").matchesExpected, false);
  assert.equal(EXPECTED_ACCOUNT_ID, "wkams.testnet");
});
