# ANONYMESH NEAR Registry Status

This page is a **read-only status inspector** for the already deployed NEAR Testnet contract. The wallet signing and deployment actions have been removed.

## Fixed target

- Network: NEAR Testnet only.
- Contract account: `registry.wkams.testnet`.
- Expected owner: `wkams.testnet`.
- Issuer ID checked: `wkams.testnet`.

## What the page does

1. Reads the contract account with NEAR RPC `view_account`.
2. Rejects an account with the empty-code hash.
3. Calls read-only `get_owner()` and checks the expected owner.
4. Calls read-only `get_issuer({ issuer_id: "wkams.testnet" })`.
5. Displays the result and final block height.

## Explicitly disabled

- No wallet connector.
- No private-key or seed-phrase input.
- No transaction signing or broadcast.
- No `CreateAccount`, `Transfer`, `AddKey`, `DeployContract`, or initialization call.
- No issuer registration or other state mutation.

The issuer lookup currently returns `null` until the owner separately registers an issuer. This UI does not perform that transaction.

## Local checks

```sh
npm test
npm run build
```
