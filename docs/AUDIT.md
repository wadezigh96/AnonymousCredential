> **Status update (2026-11-16):** This audit's earlier statement that no deployment had occurred is superseded. The NEAR registry is deployed at `registry.wkams.testnet`, owned by `wkams.testnet`; `get_owner()` was verified. Deployment transaction: [NEAR Explorer](https://explorer.testnet.near.org/transactions/DrFYWN8Kx25f3265ydvJNyfUpiPT9GpjMiQJJMBJXJYHD). Issuer registration and live verifier acceptance remain pending. See [deployment record](NEAR_TESTNET_DEPLOYMENT_2026-11-16.md).

# ANONYMESH — Repository Audit (Reconciled)

**Audit snapshot date:** 2026-11-16  
**Historical audit branch:** `fix/anonymesh-testnet-readiness`  
**Canonical status:** [PROJECT_STATUS.md](PROJECT_STATUS.md)

This is a historical source/documentation and CI snapshot, not a live audit of the current `main` tree. The current default branch is `main`; PR #2 was merged on 2026-11-17 as `e19eb1958cfa17b40f71b2f624a3fb945e3e689d`. The NEAR Testnet deployment is complete as recorded above; issuer registration and live verifier acceptance remain pending. Use [PROJECT_STATUS.md](PROJECT_STATUS.md) for current repository and CI status.

## 1. Repository architecture

The active implementation is organized around:

- `packages/anoncreds-agent-demo`: local Node.js Issuer, Holder and Verifier roles, AnonCreds CL proof flow, registry adapter and integration tests.
- `contracts/near/issuer-registry`: Rust NEAR contract for public issuer metadata and versioned status commitments.
- `crates/agent-auth`: Rust Ed25519 challenge-response and signed capability prototype.
- `apps/android`: native AnonCreds single-process smoke app; not the full three-role protocol.
- `docs/`: architecture, threat boundaries, judge guide and release evidence.

The abandoned Circom/Solidity prototypes are not part of the active architecture. Do not restore or describe them as implemented.

## 2. Evidence matrix

| Component | Finding | Evidence |
|---|---|---|
| Node AnonCreds roles | Implemented as separate local processes | [AnonCreds CI 43806163768](https://github.com/wadezigh96/anonymesh/actions/runs/43806163768): both native demo and Linux ARM64 benchmark jobs succeeded |
| Separate-process flow | Implemented and tested, including registry-required mode against deterministic mock RPC | [Process integration CI 43806163795](https://github.com/wadezigh96/anonymesh/actions/runs/43806163795): job succeeded |
| Fresh registry reads in required mode | Cache and stale fallback disabled when registry is mandatory | [Process integration CI 43817130740](https://github.com/wadezigh96/anonymesh/actions/runs/43817130740): job succeeded on test branch commit `67e528d`; this is evidence for the named tested files/commit, not proof of live RPC |
| NEAR contract | Rust source, owner checks, Ed25519 public-key validation, monotonic versions/epochs and storage-deposit accounting | [Rust/WASM CI 43805451359](https://github.com/wadezigh96/anonymesh/actions/runs/43805451359) succeeded for `a5754245...`; later mock-test-only edit `a55cda5` has not yet been re-run |
| NEAR verifier adapter | Read-only RPC `get_issuer`, strict record validation, fail-closed required mode | Deterministic local JSON-RPC mock in Node tests; no live contract |
| Capability and PoP | Integrated local verifier path | Ordinary Ed25519 proof-of-possession plus signed capability checks; not anonymous by itself |
| Replay/quota | SQLite persistence and same-host concurrent-process tests | Not a distributed/multi-host guarantee |
| Android | Single-process native proof smoke app | Not Android full-role protocol or wallet/contract integration |

## 3. Security boundaries

- AnonCreds CL presentation is the credential-based selective-disclosure proof path. It is not a general-purpose zk-SNARK/STARK and not an on-chain proof verifier.
- Ed25519 proof-of-possession is a conventional signature check, not a zero-knowledge proof.
- The demo returns an authorization decision and does not execute a real external tool or payment.
- Pairwise keys reduce some cross-audience correlation but do not establish unlinkability.
- Privacy-preserving revocation/non-revocation proofs are not implemented. The registry's status root is an opaque commitment only.
- Local SQLite tests establish same-host persistence/concurrency only.
- The local HTTP role services are not production network services; TLS, authenticated service identity, distributed rate limits and production operations remain absent.
- Human credential issuance and proof of one-human-one-identity are not implemented.

See [SECURITY_LIMITATIONS.md](SECURITY_LIMITATIONS.md) for the full threat boundary.

## 4. NEAR Testnet audit

At the time of the operator's latest read-only check, `wkams.testnet` had 18.9 NEAR, one Full Access key and no deployed contract code. The CLI configuration pointed to Testnet RPC. The local legacy `accounts.json` file was empty, and the Meteor Wallet browser bridge had not connected. Therefore, no usable CLI signer had been established.

**Historical pre-deployment finding:** at the time of this audit snapshot, no deployment or registry transaction had been performed. This statement is superseded by the deployment record linked above.

## 5. Historical findings

The earlier Circom/Solidity prototypes were removed after review. Historical findings about unconstrained message binding, verifier public-input ordering, Merkle capacity and public event disclosure apply only to deleted code. They are not current findings against the active Rust registry.

## 6. Audit scope and remaining work

This is a source/documentation and CI-evidence reconciliation, not formal verification, a complete dependency audit or an independent cryptographic review. At the time of this historical snapshot, the listed follow-up work remained. Current remaining gates are issuer registration with explicit owner approval, live `get_issuer` read-back for `issuer.testnet`, live verifier acceptance tests, and complete CI coverage on the merge commit; see [PROJECT_STATUS.md](PROJECT_STATUS.md).

Do not claim production readiness, complete anonymity, unlinkability, privacy-preserving revocation, live issuer registration, live verifier acceptance or on-chain proof verification until each has separate evidence. The Testnet contract deployment itself is recorded and verified; it is distinct from issuer registration and verifier acceptance.
