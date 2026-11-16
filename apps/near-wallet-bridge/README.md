# ANONYMESH NEAR Testnet deployer

This branch adds an explicit Meteor Wallet deployment flow to the existing read-only wallet bridge.

## Exact scope

- Network: NEAR Testnet only.
- Signer: `wkams.testnet`.
- New contract account: `registry.wkams.testnet`.
- Initial transfer: 3 NEAR from the signer to the new contract account.
- Access key: the connected wallet's public key is added as FullAccess to the new contract account.
- Contract: the issuer-registry WASM from CI run [43846695123](https://github.com/wadezigh96/anonymesh/actions/runs/43846695123).
- Required WASM SHA-256: `10a80c1d86687259fd76f1c3a6f28789069d3a37dac88fc590539735db8f43e9`.
- Initialization: `new({ owner_id: "wkams.testnet" })`.

The page does not store, request, or transmit private keys, seed phrases, or recovery phrases. It requires a wallet connection, a selected WASM file whose digest matches the pinned CI digest, and a separate checkbox before the deploy button is enabled. The transaction is only requested from the wallet after the user presses Deploy.

## Wallet transaction actions

1. `CreateAccount`
2. `Transfer` (3 NEAR)
3. `AddKey` (connected public key, FullAccess)
4. `DeployContract` (verified WASM bytes)
5. `FunctionCall` (`new`, 30 Tgas, zero deposit)

The user must inspect the five actions and the final fee in Meteor Wallet and reject any unexpected request. The 3 NEAR funding is separate from gas and storage costs. The deployed WASM occupies approximately 1.97728 NEAR of storage at the currently observed Testnet storage price; actual fees and required balance can change.

## Verification after deployment

A wallet result alone is not sufficient. Read back the account code hash, call `get_owner`, and verify it equals `wkams.testnet`. Then perform the remaining issuer registry smoke tests with a disposable issuer. Do not register a production issuer or claim end-to-end verifier acceptance based only on deployment.

## Local checks

```sh
npm test
npm run build
```

This deployer is a Testnet-only tool. It must not be reused for Mainnet without a separate review and explicit approval.
