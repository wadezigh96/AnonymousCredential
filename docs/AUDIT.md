# Repository audit — AnonymousCredential / ANONYMESH

Date: 2026-11-14
Branch inspected: `feat/anonymesh-private-agent-identity`
Default branch inspected: `main`

## 1. Current feature-branch tree

The current feature branch contains documentation, a Rust NEAR issuer/status registry crate, a Rust agent-authentication crate, and separate GitHub Actions workflows for each. The paths `circuits/anonymesh_membership.circom` and `contracts/AnonMeshRootRegistry.sol` are absent. They were deliberately removed after being identified as premature, unvalidated prototypes. No historical prototype was restored.

## 2. Requested-component inventory

| Component | Current finding |
|---|---|
| Anonymous credential issuer / holder / verifier | Not present |
| ZK proof circuit and verifier artifacts | Not present |
| Selective disclosure / attribute predicates | Not present |
| Challenge-response authentication | Ed25519 prototype in `crates/agent-auth`; 9 unit tests passed in GitHub Actions run #1 |
| Unlinkable presentations | Not present |
| Delegated capabilities | Signed parent-linked Ed25519 chain verifier in `crates/agent-auth`; 21 tests passed in run #7 |
| Privacy-preserving revocation | Not present |
| NEAR issuer/status registry contract | Present; preliminary scaffold only |
| Local-first private agent runtime | Not present |
| Anti-replay, rate limits and policy enforcement | Not present |
| Automated tests / CI | NEAR registry: 14 tests passed (run #13); agent auth and capability verifier: 21 tests passed (run #7) | 
| Cargo.lock | Generated ephemerally in CI; not committed, so dependency resolution is not pinned across runs |
| Benchmarks / privacy evaluation | Not present |

## 3. Historical implementation findings

The old `anon.circom` and `AnonCommunity.sol` were removed in prior repository commits. They were reviewed from Git history only and have not been restored.

- Historical critical finding: `messageHash` was not effectively constrained to the intended action/message statement.
- Historical critical finding: Solidity verifier public-input ordering was not demonstrated against generated verifier artifacts.
- Historical high finding: the depth-16 Merkle insertion path lacked an explicit capacity guard.
- Historical high finding: wallet-based registration did not establish unique human or agent identity.
- Historical high finding: public message events disclosed message content and metadata.
- Historical high finding: trusted-setup and verifier-artifact provenance were underspecified.

These findings describe deleted historical code, not active source files.

## 4. Documentation defects found

A previous README revision incorrectly claimed a membership circuit and root registry prototype were implemented, and this audit repeated that claim. Those historical documentation errors have since been corrected: the deleted prototype files remain absent, and the current Rust registry scaffold is described separately with its actual CI evidence.

## 5. Audit limits

This is a preliminary source/tree review plus inspection of the latest GitHub Actions run. It is not a complete dependency vulnerability audit, formal verification or independent cryptographic review. The registry crate has an active Cargo.toml but no committed Cargo.lock. The rest of the ANONYMESH credential, proof, agent runtime and privacy layers remain unimplemented.

## 6. Next audit gate

Before adding dependencies, complete the comparison of maintained anonymous-credential implementations and revocation designs for cryptographic assumptions, selective disclosure, predicates, unlinkability, revocation privacy, language/runtime support (including Android ARM64), maintenance, independent audits, interoperability, proof size, proof-generation latency, verification latency and memory.

No custom cryptographic primitive is permitted. No implementation, production-security, privacy, or performance claim is accepted without reproducible tests and evidence.

## 7. Cryptographic candidate review (2026-11-14)

A source-backed comparison is recorded in [`CRYPTO_SELECTION.md`](CRYPTO_SELECTION.md). AnonCreds v1 remains the preferred protocol candidate, but crate integration is blocked by upstream issue #372: `anoncreds-clsignatures 0.3.2` depends on a `glass_pumpkin` release requiring yanked `core2 0.4.0`. The official advisory GHSA-89r4-4c4j-7wx9 lists v0.2.2 as affected and v0.2.3 as patched; it describes mixed link-secret credentials being accepted by the verifier. The advisory page does not list a CVE ID; do not label it CVE-2025-67498. AnonCreds v2 remains a next-generation research candidate; W3C BBS remains an interoperability candidate. No dependency has been added and no credential implementation is claimed.

## 8. AnonCreds dependency and security findings

- [GHSA-89r4-4c4j-7wx9](https://github.com/anoncreds/anoncreds-rs/security/advisories/GHSA-89r4-4c4j-7wx9) is verified: affected `anoncreds-rs` 0.2.2; patched 0.2.3. The advisory describes a verifier accepting multiple credentials bound to different link secrets as if they belonged to one holder. It lists no CVE ID.
- Upstream [issue #372](https://github.com/anoncreds/anoncreds-rs/issues/372) remains open and documents dependency resolution failure: `glass_pumpkin 1.6.x` requires yanked `core2 0.4.0` through `anoncreds-clsignatures 0.3.2`.
- [docs.rs build record](https://docs.rs/crate/anoncreds-clsignatures/latest/builds/3495948) independently shows the same yanked dependency failure.
- Therefore the patched release is not yet approved for crate integration. Do not bypass Cargo resolution with an unreviewed fork/patch. No AnonCreds crate or binary was added to this repository.

## 9. Delegated capability implementation slice

`crates/agent-auth` now includes signed capabilities with parent digests, issuer/delegate Ed25519 keys, audience, exact action/resource, expiry and quota. `verify_capability_chain` checks the trusted root issuer, every signature and parent link, delegator continuity, exact scope equality, and non-increasing expiry/quota, with a maximum delegation depth of 8. GitHub Actions run #7 (`43603320311`) passed 21/21 tests, including action/expiry/quota escalation, wrong delegator, broken parent link and expired-root rejection. Limitations: action/resource are currently exact-match rather than expressive subset policies; quota is metadata only and is not atomically consumed; revocation is not enforced. This is a prototype policy-chain verifier, not a complete runtime authorization engine.

## 9. Agent challenge-response implementation slice

A small Rust crate at `crates/agent-auth` verifies Ed25519 signatures over a domain-separated transcript binding nonce, audience, task, capability digest and expiry. Its in-memory replay guard rejects reused nonces and fails closed when full. GitHub Actions run #1 (`43602842365`) passed 9/9 tests. This is ordinary proof-of-possession authentication: it reveals/uses a stable public key and is **not** an anonymous credential, ZK proof, unlinkable presentation, durable distributed replay defense, or capability-policy engine. The lockfile is generated ephemerally in CI and is not committed.

## 9. First NEAR registry implementation slice

A Rust contract scaffold now exists at `contracts/near/issuer-registry` using `near-sdk = 5.30.1`. It stores issuer public-key metadata, key version, schema hash, active flag, status epoch and status root. Owner-only mutations and monotonic key/status version checks are implemented in source. Key rotation preserves suspension and status history. The contract does not verify ZK proofs or non-revocation witnesses and its status root is an opaque commitment only.

Fourteen unit tests are present in source, covering owner authorization, malformed schema/status hashes, issuer suspension, key-version rollback, status epoch monotonicity, unknown issuer handling, empty key and state preservation during key rotation. GitHub Actions run #13 at commit `c4f4f821` completed successfully: 14/14 unit tests passed and the `wasm32-unknown-unknown --release` build passed. The workflow generates a lockfile inside the runner, then runs `cargo test --locked` and `cargo build --locked`; the lockfile is not committed, so dependency resolution is not pinned across independent runs. This is a code-level preliminary audit, not an independent security review.
