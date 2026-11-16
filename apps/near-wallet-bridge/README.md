# ANONYMESH NEAR Wallet Bridge

A deliberately read-only wallet connection preflight for the ANONYMESH NEAR Testnet registry.

## Scope

- Uses `@hot-labs/near-connect` (NEAR Connect) with `network: "testnet"`.
- Filters the wallet picker for wallets advertising Testnet support.
- Displays the selected account and checks for an exact match with `wkams.testnet`.
- Handles connection and sign-out events.
- Contains no transaction construction or signing call. It cannot deploy the WASM, initialize the contract, register an issuer, transfer funds, or mutate chain state.

## Run

Requires Node.js 20.19+.

```sh
cd apps/near-wallet-bridge
npm install
npm test
npm run dev
```

Open the local Vite URL in a browser. On Android, use a browser that can hand off to the installed wallet app. Choose Meteor Wallet if it appears in the NEAR Connect picker, select the Testnet account `wkams.testnet`, and approve only the connection request. If the wallet or account is not offered, stop; do not import keys into an unrelated wallet or change account keys to make the bridge work.

## Security boundary

This app does not request a seed phrase, private key, recovery phrase, or local CLI credential. It does not request a signature or transaction. A successful wallet connection proves only that the connector received the selected account from the wallet; it does not prove that the account has sufficient balance, the expected Full Access key is available, or the contract is deployed.

The expected account comparison is exact. A different account is shown as a mismatch and must not be used for deployment.

## Next gated stage

A separate deployment module must not be added until the wallet connection is tested on the user's device and the WASM artifact is selected and checksum-verified. Any future deployment UI must show the exact target account, verified artifact checksum, DeployContract + `new({ owner_id: "wkams.testnet" })` actions, attached deposit, gas budget, and final wallet fee estimate, then wait for explicit approval in the wallet. This read-only bridge intentionally does not implement that stage.
