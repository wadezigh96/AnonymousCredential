# ANONYMESH NEAR Testnet Deployment Record

**Date:** 2026-11-16  
**Repository:** [wadezigh96/anonymesh](https://github.com/wadezigh96/anonymesh)  
**Network:** NEAR Testnet

## Deployment

- Contract account: `registry.wkams.testnet`
- Owner account: `wkams.testnet`
- Initialization: `new({"owner_id":"wkams.testnet"})`
- Deployment transaction: [DrFYWN8Kx25f3265ydvJNyfUpiPT9GpjMiQJJMBJXJYHD](https://explorer.testnet.near.org/transactions/DrFYWN8Kx25f3265ydvJNyfUpiPT9GpjMiQJJMBJXJYHD)
- Source commit used for the verified WASM artifact: `c8c2529d76a04be1bf8ab2ea33662ef661d463b2`
- WASM SHA-256: `10a80c1d86687259fd76f1c3a6f28789069d3a37dac88fc590539735db8f43e9`

## Post-deployment read checks

- `get_owner()` returned `wkams.testnet`.
- `get_issuer({"issuer_id":"wkams.testnet"})` returned `null`, as expected before any issuer has been registered.

These checks establish that the contract was deployed and initialized with the expected owner. They do **not** establish that an issuer has been registered or that the verifier has completed live-chain acceptance testing.

## Remaining integration work

1. Create or select the persistent issuer Ed25519 key and state files securely. Do not commit private key material or place it in chat.
2. Register the matching issuer public key, key version and schema hash from the owner account, after reviewing the exact call arguments, storage deposit and gas.
3. Read back the issuer record using Testnet RPC.
4. Run verifier acceptance tests with `NEAR_REQUIRED=true` against the deployed contract: valid issuer accepted; unknown/inactive issuer and key/schema mismatch denied; RPC outage or malformed registry data denied.
5. Update this record with issuer-registration transaction and live verifier evidence only after those steps succeed.

## Security boundary

The registry stores public issuer metadata and status information. It does not store holder secrets, credentials, link secrets, proof witnesses or private attributes. The NEAR account access key is not the issuer's Ed25519 signing key. Never publish seed phrases, private keys, or private issuer JWK files.
