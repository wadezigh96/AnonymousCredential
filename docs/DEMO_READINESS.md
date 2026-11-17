> **Current status (2026-11-17):** The NEAR Testnet registry is deployed and its owner view has been verified. Issuer registration and live verifier acceptance remain pending. This document is aligned with [canonical project status](PROJECT_STATUS.md).

# ANONYMESH — Demo Readiness

**Repository:** `wadezigh96/anonymesh`  
**Current default branch:** `main` (PR #2 merged as `e19eb1958cfa17b40f71b2f624a3fb945e3e689d`)  
**Status date:** 2026-11-17  
**Canonical release gate:** [PROJECT_STATUS.md](PROJECT_STATUS.md)

## Readiness result

<ins>Ready for a local prototype demonstration with clearly stated limitations.</ins>

**Partial live Testnet integration only.** The registry contract is deployed at `registry.wkams.testnet`, and `get_owner()` returned `wkams.testnet`. No issuer-registration transaction or live verifier acceptance is recorded.

## Verified evidence

- The Node Issuer–Holder–Verifier prototype and separate-process integration have successful CI evidence.
- The seven-workflow baseline succeeded on code commit `abaed695535f6da1c465f0e3291a4989175fb7ba`. On PR #2 head `774bbba1e8ef30ff2e0b0bcc1a3cb66474f22ece`, five workflows passed: [agent authentication](https://github.com/wadezigh96/anonymesh/actions/runs/44117993558), [NEAR wallet bridge](https://github.com/wadezigh96/anonymesh/actions/runs/44117993403), [Linux ARM64 benchmark](https://github.com/wadezigh96/anonymesh/actions/runs/44117993371), [NEAR contract/WASM](https://github.com/wadezigh96/anonymesh/actions/runs/44117993350), and [AnonCreds process integration](https://github.com/wadezigh96/anonymesh/actions/runs/44117993347). The AnonCreds integration and Android workflows did not run on PR #2; the merge commit itself still needs a full CI run.
- AnonCreds integration: [run 43957294481](https://github.com/wadezigh96/anonymesh/actions/runs/43957294481).
- Separate-process integration: [run 43957294275](https://github.com/wadezigh96/anonymesh/actions/runs/43957294275).
- NEAR contract tests and WASM build: [run 43957294232](https://github.com/wadezigh96/anonymesh/actions/runs/43957294232).
- NEAR wallet bridge tests/build: [run 43957294524](https://github.com/wadezigh96/anonymesh/actions/runs/43957294524).
- Agent authentication: [run 43957294270](https://github.com/wadezigh96/anonymesh/actions/runs/43957294270).
- Linux ARM64 benchmark: [run 43957294284](https://github.com/wadezigh96/anonymesh/actions/runs/43957294284).
- Android standalone release APK build/verification: [run 43957294273](https://github.com/wadezigh96/anonymesh/actions/runs/43957294273).
- The GitHub application at `apps/near-wallet-bridge` is a read-only registry inspector. It can connect/disconnect a wallet to check the owner account ID, but it does not sign or broadcast transactions.

## Important issuer-ID distinction

The owner account is `wkams.testnet`; the read-only GitHub bridge is configured to inspect issuer ID `issuer.testnet`. The recorded preflight query `get_issuer({"issuer_id":"wkams.testnet"})` queried the owner account as an issuer ID and returned `null`. That result is not a live read-back for `issuer.testnet`. A separate read-only query for `issuer.testnet` is still required before claiming its on-chain state.

## Not yet verified

- Issuer registration on NEAR Testnet.
- A live `get_issuer({"issuer_id":"issuer.testnet"})` read-back.
- Live verifier acceptance/rejection against the deployed contract.
- The newer Android/Meteor Wallet mutation-capable bridge. Its current source remains local and is not part of this GitHub repository.
- Production security, unlinkability, privacy-preserving revocation, distributed replay protection, or production tool execution.

## Safe demo sequence

1. Show the local Issuer, Holder and Verifier processes and selective-disclosure proof.
2. Show tampered proof, wrong challenge/context and replay rejection.
3. Show capability scope, Ed25519 proof-of-possession and quota/replay checks as separate authorization controls.
4. Show registry-required mode against the deterministic mock RPC and label it clearly as mock evidence.
5. Show the deployed Testnet contract and the recorded `get_owner()` result; do not imply that issuer registration or live verifier acceptance has occurred.
6. State the privacy and production limitations listed in [SECURITY_LIMITATIONS.md](SECURITY_LIMITATIONS.md).

## NEAR Testnet acceptance checklist

- [ ] Confirm the persistent issuer Ed25519 public key and matching metadata; keep private key material local.
- [ ] Review the exact owner signer, contract, method, arguments, attached storage deposit, gas and expected state change.
- [ ] Obtain explicit owner approval before signing or broadcasting `register_issuer`.
- [ ] Read back `get_issuer({"issuer_id":"issuer.testnet"})` from live Testnet RPC and record final block evidence.
- [ ] Run live verifier acceptance tests: valid issuer accepted; unknown/inactive issuer and key/schema mismatch denied; RPC outage and malformed data denied.
- [ ] Capture a judge-ready demo without exposing credentials, link secrets, private keys or personal claims.

No wallet import, key generation, deployment, registry write, payment or mainnet action is included in this readiness document. Every Testnet mutation requires separate review and explicit approval.

## Judge-facing one-sentence description

ANONYMESH is a local Issuer–Holder–Verifier prototype using AnonCreds selective disclosure and a separate authorization gate, with a Rust NEAR public issuer registry deployed on Testnet and a fail-closed read-only verifier adapter tested against deterministic mock RPC; issuer registration and live verifier acceptance remain pending.