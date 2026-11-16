# ANONYMESH — Project Status and Release Gate

**Last reconciled:** 2026-11-16  
**Repository:** [wadezigh96/anonymesh](https://github.com/wadezigh96/anonymesh)  
**Working branch for this reconciliation:** `fix/anonymesh-testnet-readiness`

This is the canonical status page. If an older planning or audit document disagrees with this page, use the newer evidence linked here and update the stale document rather than repeating its claim.

## Executive status

ANONYMESH has a runnable local Issuer–Holder–Verifier prototype, a separate authorization gate, a Rust NEAR issuer registry, and a read-only registry adapter tested against a deterministic JSON-RPC mock. Linux CI evidence exists for the Node proof flow, separate-process integration, and the NEAR contract build.

**ANONYMESH is not yet a live NEAR Testnet deployment and is not production-ready.** No contract deployment, issuer-registration transaction, payment, or mainnet action is claimed. The remaining Testnet work is operational integration and live-chain acceptance testing, not a reason to rewrite the protocol architecture again.

## Evidence-backed implementation matrix

| Area | Current state | Evidence / boundary |
|---|---|---|
| Issuer / Holder / Verifier | Implemented as three local Node.js processes | AnonCreds CI run [43806163768](https://github.com/wadezigh96/anonymesh/actions/runs/43806163768) succeeded; process integration run [43806163795](https://github.com/wadezigh96/anonymesh/actions/runs/43806163795) succeeded |
| Selective disclosure and hidden predicates | Implemented with AnonCreds CL presentations | Credential proof is not a general-purpose zk-SNARK/STARK and is not verified on-chain |
| Agent-key binding and Ed25519 PoP | Integrated in the local verifier path | Conventional signature/key-possession check; not itself a ZK proof or anonymity guarantee |
| Delegated capability checks | Signed capability chain and verifier policy checks in the local prototype | One root capability in the demo; no production multi-domain delegation or external tool execution |
| Replay and quota state | SQLite persistence and same-host concurrent verifier integration | Same-host/local-file evidence only; not a distributed database guarantee |
| NEAR issuer registry | Rust contract source with owner-only issuer/status mutation and storage-deposit accounting | Rust/WASM CI run [43805451359](https://github.com/wadezigh96/anonymesh/actions/runs/43805451359) succeeded for source commit `a5754245fd017eb00440f8799bd793eed64b648d`; a later mock-test-only adjustment exists at `a55cda5c8c2cc95511cf2b18ad01a4a618c74023` and still needs a fresh contract workflow run |
| NEAR read adapter | Read-only `get_issuer` RPC adapter with strict validation and fail-closed required mode | Deterministic local mock-RPC and separate-process CI passed; not live-chain evidence |
| Android | Single-process native AnonCreds smoke app | Reported physical-device smoke test is not the full three-role protocol or wallet/contract integration |
| Unlinkability / revocation | Not implemented or demonstrated | Selective disclosure must not be described as full anonymity, unlinkability, or revocation |
| Production service / payments | Not implemented | No production TLS/service identity, distributed replay store, tool host, or payment rail |

## Current NEAR Testnet facts

The operator has verified through NEAR Testnet RPC/CLI:

- Account: `wkams.testnet`
- Observed balance: 18.9 NEAR at the inspected block
- One on-chain Full Access key exists
- The account had **no contract code** at the time of inspection
- The Rust `near-cli-rs 0.30.1` binary runs in Termux
- The local `accounts.json` file is empty; a usable local signer has not been established
- Meteor Wallet browser integration has not yet been successfully connected

These facts do not authorize a transaction. A deployer signer and a deliberate contract-account plan must be established before deployment. Never place a seed phrase or private key in GitHub, source code, logs, or chat.

## Intended architecture and data boundaries

```text
Issuer
  | issues AnonCreds credential bound to an agent key
  v
Holder / Agent A
  | retains link secret and private attributes locally
  | creates selective-disclosure presentation
  | proves Ed25519 key possession and presents capability
  v
Verifier / Agent B
  | validates original presentation request and fresh challenge
  | checks issuer trust through NEAR registry when required
  v
Authorization gate
  | checks audience, action, resource, expiry, delegation,
  | replay and quota; deny by default
  v
ALLOW / DENY decision
```

NEAR stores public issuer metadata only: issuer account, Ed25519 public key, key version, schema hash, active state, status epoch and opaque status root. It does not store holder names, personal attributes, credentials, link secrets, proof witnesses or per-presentation activity. The contract is a public trust/status registry; it is not an AnonCreds verifier, privacy-preserving revocation proof system, private chain, or payment rail.

## Repository map

| Path | Responsibility |
|---|---|
| `packages/anoncreds-agent-demo/src/roles/` | Issuer, Holder and Verifier local role processes |
| `packages/anoncreds-agent-demo/src/near-issuer-registry.mjs` | Read-only NEAR JSON-RPC adapter |
| `packages/anoncreds-agent-demo/test/` | Unit and separate-process integration tests |
| `contracts/near/issuer-registry/` | NEAR Rust contract, tests and lockfile |
| `crates/agent-auth/` | Rust Ed25519 challenge/capability prototype |
| `apps/android/` | Android native AnonCreds smoke app, not the full protocol stack |
| `docs/ANONYMESH_ARCHITECTURE.md` | Detailed architecture and component status |
| `docs/SECURITY_LIMITATIONS.md` | Threat boundaries and unsupported guarantees |
| `docs/NEAR_JUDGE_GUIDE.md` | Judge-facing explanation and live Testnet acceptance evidence |

## Reproduce local evidence

From the repository root on a supported Linux environment:

```sh
npm install --prefix packages/anoncreds-agent-demo --no-audit --no-fund
npm test --prefix packages/anoncreds-agent-demo
npm run demo --prefix packages/anoncreds-agent-demo
cargo test --locked --manifest-path contracts/near/issuer-registry/Cargo.toml
cargo build --locked --manifest-path contracts/near/issuer-registry/Cargo.toml --target wasm32-unknown-unknown --release
```

The native AnonCreds Node package does not support running its Linux native binary directly in Android Termux. Use the Linux CI evidence for that test suite; do not label a Termux native-wrapper failure as a protocol test failure or as an Android success.

## Remaining release gates — in order

1. **Re-run contract CI against the latest contract source**, including the mock-runtime storage/refund tests. Do not treat the earlier CI run as testing the later `a55cda5` change.
2. **Choose and verify the Testnet signer path.** Use the existing Meteor Wallet only if a supported signing integration is confirmed. Do not generate or install an unrelated key and do not expose recovery material.
3. **Finalize contract account strategy.** Decide whether to deploy to `wkams.testnet` or a dedicated subaccount; verify deployer authority, storage, gas and recovery plan.
4. **Review the exact deployment + initialization payload** for `new({"owner_id":"wkams.testnet"})`, WASM checksum and expected fees. Obtain explicit owner approval before signing.
5. **Deploy to Testnet**, then record contract account ID, transaction hash, explorer link, source commit and WASM SHA-256.
6. **Register a disposable public test issuer** with an attached storage deposit; record the transaction and expected public metadata.
7. **Read back live state** with `get_owner` and `get_issuer` from Testnet RPC.
8. **Run verifier acceptance tests against the live contract**: valid issuer accepted; unknown/inactive issuer and key/schema mismatch denied; RPC outage/malformed data denied (fail closed).
9. **Capture a judge-ready demo** that shows the live transaction and state while keeping all holder secrets and private claims off-chain.

## Definition of done

The Testnet integration is complete only when all applicable live-chain gates above have reproducible evidence. A passing unit test, successful WASM build, mock RPC, account balance, or wallet connection by itself is not a deployment.

Production readiness is a separate future gate requiring independent cryptographic review, unlinkability evaluation, privacy-preserving revocation, authenticated transport, distributed replay/quota storage, operational key management and real tool-host enforcement.
