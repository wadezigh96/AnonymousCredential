# ANONYMESH — Project Status and Release Gate

**Last reconciled:** 2026-11-17  
**Repository:** [wadezigh96/anonymesh](https://github.com/wadezigh96/anonymesh)  
**Working branch for this reconciliation:** `feat/anonymesh-near-testnet-deployer`

This is the canonical status page. If an older planning or audit document disagrees with this page, use the newer evidence linked here and update the stale document rather than repeating its claim.

## Executive status

ANONYMESH has a runnable local Issuer–Holder–Verifier prototype, a separate authorization gate, a Rust NEAR issuer registry, and a read-only registry adapter tested against a deterministic JSON-RPC mock. On code commit `abaed695535f6da1c465f0e3291a4989175fb7ba` (before the subsequent documentation-only refresh commits), all seven GitHub Actions workflows succeeded: AnonCreds integration (both jobs), separate-process integration, NEAR contract tests/WASM build, NEAR wallet bridge, agent authentication, Linux ARM64 benchmark, and Android standalone release APK build/verification. This is CI evidence only; issuer registration and live verifier acceptance remain pending.

**The NEAR issuer registry is deployed and initialized on NEAR Testnet; ANONYMESH is not production-ready.** Contract account: `registry.wkams.testnet`; owner: `wkams.testnet`. Deployment transaction: [DrFYWN8Kx25f3265ydvJNyfUpiPT9GpjMiQJJMBJXJYHD](https://explorer.testnet.near.org/transactions/DrFYWN8Kx25f3265ydvJNyfUpiPT9GpjMiQJJMBJXJYHD). `get_owner()` returned `wkams.testnet`; `get_issuer({"issuer_id":"wkams.testnet"})` returned `null`, as expected before issuer registration. No issuer-registration transaction or live verifier acceptance is claimed. See [deployment record](NEAR_TESTNET_DEPLOYMENT_2026-11-16.md).

## Evidence-backed implementation matrix

| Area | Current state | Evidence / boundary |
|---|---|---|
| Issuer / Holder / Verifier | Implemented as three local Node.js processes | Current PR-head AnonCreds integration run [43957294481](https://github.com/wadezigh96/anonymesh/actions/runs/43957294481) succeeded; separate-process integration run [43957294275](https://github.com/wadezigh96/anonymesh/actions/runs/43957294275) succeeded |
| Selective disclosure and hidden predicates | Implemented with AnonCreds CL presentations | Credential proof is not a general-purpose zk-SNARK/STARK and is not verified on-chain |
| Agent-key binding and Ed25519 PoP | Integrated in the local verifier path | Conventional signature/key-possession check; not itself a ZK proof or anonymity guarantee |
| Delegated capability checks | Signed capability chain and verifier policy checks in the local prototype | One root capability in the demo; no production multi-domain delegation or external tool execution |
| Replay and quota state | SQLite persistence and same-host concurrent verifier integration | Same-host/local-file evidence only; not a distributed database guarantee |
| NEAR issuer registry | Deployed and initialized on Testnet | Contract `registry.wkams.testnet`; owner read-back succeeded; deployment tx [DrFYWN8Kx25f3265ydvJNyfUpiPT9GpjMiQJJMBJXJYHD](https://explorer.testnet.near.org/transactions/DrFYWN8Kx25f3265ydvJNyfUpiPT9GpjMiQJJMBJXJYHD). Contract CI on current PR head succeeded: [run 43957294232](https://github.com/wadezigh96/anonymesh/actions/runs/43957294232). Source artifact SHA `c8c2529d76a04be1bf8ab2ea33662ef661d463b2`; WASM SHA-256 `10a80c1d86687259fd76f1c3a6f28789069d3a37dac88fc590539735db8f43e9` |
| NEAR read adapter | Read-only `get_issuer` RPC adapter with strict validation and fail-closed required mode | Deterministic local mock-RPC and separate-process CI passed; not live-chain evidence |
| Android | Single-process native AnonCreds smoke app | Current PR-head Android workflow [43957294273](https://github.com/wadezigh96/anonymesh/actions/runs/43957294273) successfully built and verified the standalone release APK; this is not the full three-role protocol or wallet/contract integration |
| Unlinkability / revocation | Not implemented or demonstrated | Selective disclosure must not be described as full anonymity, unlinkability, or revocation |
| Production service / payments | Not implemented | No production TLS/service identity, distributed replay store, tool host, or payment rail |

## Current NEAR Testnet facts

The operator has verified through NEAR Testnet RPC/CLI:

- Contract account: `registry.wkams.testnet`
- Owner account: `wkams.testnet`
- Deployment transaction: [DrFYWN8Kx25f3265ydvJNyfUpiPT9GpjMiQJJMBJXJYHD](https://explorer.testnet.near.org/transactions/DrFYWN8Kx25f3265ydvJNyfUpiPT9GpjMiQJJMBJXJYHD)
- `get_owner()` returned `wkams.testnet`; `get_issuer({"issuer_id":"wkams.testnet"})` returned `null` (no issuer registered yet)
- Account: `wkams.testnet`
- Latest read-only `view_account` query in this audit: block height `277937423`, hash `4Qta8z5jfnZdUFa5gN3YS9qx9XbEsQyfmxqEpcz4217H`
- Observed balance: 18.9 NEAR at that block
- Account code hash: `11111111111111111111111111111111` (no contract code at that block)
- A previous access-key inspection found one on-chain Full Access key; the audit did not expose or reuse its private material
- The Rust `near-cli-rs 0.30.1` binary runs in Termux
- The local `accounts.json` file is empty; a usable local signer has not been established
- Meteor Wallet browser integration has not yet been successfully connected

The contract deployment is complete. The next owner-authorized operation is issuer registration, which still requires a persistent issuer Ed25519 key, matching public metadata, storage deposit/gas review, and explicit approval of the exact transaction. Never place a seed phrase, private key, or private issuer JWK in GitHub, source code, logs, or chat.

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

1. **Application-code CI is green:** all seven workflows succeeded on code commit `abaed695535f6da1c465f0e3291a4989175fb7ba`; later commits in this PR only refreshed documentation. The NEAR contract unit-test/WASM build run is [43957294232](https://github.com/wadezigh96/anonymesh/actions/runs/43957294232); the uploaded artifact evidence remains separately recorded. Re-run contract CI if contract source or its build workflow changes.
2. **Prepare persistent issuer identity.** Select/create the issuer Ed25519 key and state files securely; keep private material local and owner-only.
3. **Register the matching public issuer record** from `wkams.testnet` with reviewed key version, schema hash, storage deposit and gas; obtain explicit approval before signing.
4. **Read back live issuer state** with `get_issuer` on Testnet.
5. **Run verifier acceptance tests against the live contract**: valid issuer accepted; unknown/inactive issuer and key/schema mismatch denied; RPC outage/malformed data denied (fail closed).
6. **Capture a judge-ready demo** showing the live deployment and issuer state while keeping holder secrets and private claims off-chain.

## Definition of done

The contract deployment gate is complete. Full Testnet integration remains incomplete until issuer registration and live verifier acceptance have reproducible evidence.

Production readiness is a separate future gate requiring independent cryptographic review, unlinkability evaluation, privacy-preserving revocation, authenticated transport, distributed replay/quota storage, operational key management and real tool-host enforcement.
