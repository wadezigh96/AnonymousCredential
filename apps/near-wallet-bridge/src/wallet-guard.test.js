import test from "node:test";
import assert from "node:assert/strict";

import {
  getVerifiedOwnerAccount,
  EXPECTED_OWNER_ACCOUNT_ID,
} from "./wallet-guard.js";

test("accepts the expected owner on NEAR Testnet", () => {
  const account = { accountId: EXPECTED_OWNER_ACCOUNT_ID };

  assert.equal(
    getVerifiedOwnerAccount({
      network: "testnet",
      accounts: [account],
    }),
    account,
  );
});

test("rejects Mainnet", () => {
  assert.throws(
    () => getVerifiedOwnerAccount({
      network: "mainnet",
      accounts: [{ accountId: EXPECTED_OWNER_ACCOUNT_ID }],
    }),
    /Testnet/,
  );
});

test("rejects a wallet without the expected owner", () => {
  assert.throws(
    () => getVerifiedOwnerAccount({
      network: "testnet",
      accounts: [{ accountId: "other.testnet" }],
    }),
    /wkams.testnet/,
  );
});

test("rejects an invalid account list", () => {
  assert.throws(
    () => getVerifiedOwnerAccount({
      network: "testnet",
      accounts: null,
    }),
    /tidak valid/,
  );
});
