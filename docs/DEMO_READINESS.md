> **Superseded deployment status (2026-11-16):** The registry is deployed and initialized at `registry.wkams.testnet` (owner `wkams.testnet`); `get_owner()` was verified. Issuer registration and live verifier acceptance remain pending. See [deployment record](NEAR_TESTNET_DEPLOYMENT_2026-11-16.md) and [project status](PROJECT_STATUS.md).

# ANONYMESH — Demo Readiness

**Repository:** `wadezigh96/anonymesh`  
**Branch:** `fix/anonymesh-testnet-readiness`  
**Status date:** 2026-11-16  
**Canonical release gate:** [PROJECT_STATUS.md](PROJECT_STATUS.md)

## Readiness result

<ins>Ready for a local prototype demonstration with clearly stated limitations.</ins>

**Partial live Testnet integration only.** Contract deployment and owner read-back are verified; there is not yet a live issuer record or live verifier acceptance result.

## Evidence

- AnonCreds native demo and Linux ARM64 benchmark jobs passed in [CI run 43806163768](https://github.com/wadezigh96/anonymesh/actions/runs/43806163768).
- Separate-process integration passed in [CI run 43806163795](https://github.com/wadezigh96/anonymesh/actions/runs/43806163795).
- Required-mode fresh registry-read integration passed in [CI run 43817130740](https://github.com/wadezigh96/anonymesh/actions/runs/43817130740) on the test branch commit `67e528d`.
- NEAR Rust tests, WASM release build, checksum and artifact upload passed in [CI run 43805451359](https://github.com/wadezigh96/anonymesh/actions/runs/43805451359) for source commit `a5754245fd017eb00440f8799bd793eed64b648d`.
- The later contract test-harness adjustment at `a55cda5c8c2cc95511cf2b18ad01a4a618c74023` still needs a fresh NEAR workflow run. Do not silently inherit the earlier green result as if it tested that edit.

## Local reproduction

Run on a supported Linux environment from repository root:

```sh
npm install --prefix packages/anoncreds-agent-demo --no-audit --no-fund
npm test --prefix packages/anoncreds-agent-demo
npm run demo --prefix packages/anoncreds-agent-demo
cargo test --locked --manifest-path contracts/near/issuer-registry/Cargo.toml
cargo build --locked --manifest-path contracts/near/issuer-registry/Cargo.toml --target wasm32-unknown-unknown --release
```

The Node native AnonCreds wrapper used by this package does not support the Android Termux native runtime. Use the passing Linux CI evidence for the native Node suite; do not describe a Termux native-loader error as a protocol regression.

## Demo sequence

1. Show the three local roles: Issuer, Holder (Agent A), Verifier (Agent B).
2. Show a valid selective-disclosure presentation and the hidden predicate result.
3. Show tampered proof, wrong challenge/context and replay rejection.
4. Show capability scope, Ed25519 proof-of-possession and quota/replay checks as distinct authorization checks.
5. Show registry-required mode using the deterministic mock RPC and explain that this is not live Testnet.
6. State limitations: no unlinkability guarantee, no privacy-preserving revocation, no production transport/tool execution and no deployed contract.

## NEAR Testnet acceptance checklist

- [ ] Re-run Rust contract tests and WASM build against the latest contract source.
- [ ] Confirm a supported signer for the intended Testnet account without exporting seed/private key.
- [ ] Decide the contract account/deployer account strategy and estimate storage/gas.
- [ ] Review the exact WASM checksum and `new({"owner_id":"wkams.testnet"})` initialization payload.
- [ ] Obtain explicit approval, then deploy to Testnet and capture transaction/explorer evidence.
- [ ] Register a disposable issuer with the required storage deposit.
- [ ] Read back `get_owner` and `get_issuer` from live Testnet RPC.
- [ ] Verify valid issuer acceptance and unknown/inactive/mismatched issuer rejection against the live registry.
- [ ] Verify RPC outage and malformed records fail closed.
- [ ] Record the flow without exposing credentials, link secrets, private keys or personal claims.

No wallet import, key generation, deployment, registry write, payment or mainnet action is included in this checklist. A Testnet transaction must be separately reviewed and explicitly approved.

## Judge-facing one-sentence description

ANONYMESH is a local Issuer–Holder–Verifier prototype using AnonCreds selective disclosure and a separate authorization gate, with a Rust NEAR public issuer registry and a fail-closed read-only verifier adapter tested against deterministic mock RPC; contract deployment is complete; live issuer registration and verifier acceptance remain explicit acceptance gates.
