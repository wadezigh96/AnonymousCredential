# Repository audit — AnonymousCredential / ANONYMESH

Date: 2026-11-14
Branch inspected: `feat/anonymesh-private-agent-identity`
Default branch inspected: `main`

## 1. Current feature-branch tree

The current feature branch contains the documentation, one Rust NEAR issuer/status registry crate, and one GitHub Actions workflow. The paths `circuits/anonymesh_membership.circom` and `contracts/AnonMeshRootRegistry.sol` are absent. They were deliberately removed after being identified as premature, unvalidated prototypes. No historical prototype was restored.

## 2. Requested-component inventory

| Component | Current finding |
|---|---|
| Anonymous credential issuer / holder / verifier | Not present |
| ZK proof circuit and verifier artifacts | Not present |
| Selective disclosure / attribute predicates | Not present |
| Challenge-response authentication | Not present |
| Unlinkable presentations | Not present |
| Delegated capabilities | Not present |
| Privacy-preserving revocation | Not present |
| NEAR issuer/status registry contract | Present; preliminary scaffold only |
| Local-first private agent runtime | Not present |
| Anti-replay, rate limits and policy enforcement | Not present |
| Automated tests / CI / dependency lockfile | Not found in inspected feature-branch tree |
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

The branch README incorrectly claimed a membership circuit and root registry prototype were implemented, and the remediation section of this audit repeated that claim. The two source files were already absent. These stale claims must be corrected before implementation proceeds.

## 5. Audit limits

This is a repository-tree and historical-source review. It is not yet a complete dependency vulnerability audit or independent cryptographic review. No active package manifests, lockfiles, tests, CI workflows or implementation source were found in the inspected feature-branch tree, so there is currently no active dependency graph or runnable project test suite to assess.

## 6. Next audit gate

Before choosing dependencies, compare maintained anonymous-credential implementations and revocation designs for cryptographic assumptions, selective disclosure, predicates, unlinkability, revocation privacy, language/runtime support (including Android ARM64), maintenance, independent audits, interoperability, proof size, proof-generation latency, verification latency and memory.

No custom cryptographic primitive is permitted. No implementation, production-security, privacy, or performance claim is accepted without reproducible tests and evidence.

## 7. Cryptographic candidate review (2026-11-14)

A source-backed comparison is recorded in [`CRYPTO_SELECTION.md`](CRYPTO_SELECTION.md). The provisional first local integration candidate is AnonCreds v1 / `anoncreds-rs` v0.2.3 or later, subject to upstream regression, Android ARM64 and dependency audit gates. A previous note cited GHSA-89r4-4c4j-7wx9 / CVE-2025-67498, but the advisory could not be independently retrieved or corroborated during follow-up. Its affected/fixed range is unverified and must not be treated as fact. Confirm advisories before selecting a dependency version. AnonCreds v2 remains a next-generation research candidate; W3C BBS remains an interoperability candidate. No dependency has been added and no implementation is claimed.

## 8. First NEAR registry implementation slice

A Rust contract scaffold now exists at `contracts/near/issuer-registry` using `near-sdk = 5.30.1`. It stores issuer public-key metadata, key version, schema hash, active flag, status epoch and status root. Owner-only mutations and monotonic key/status version checks are implemented in source. Key rotation preserves suspension and status history. The contract does not verify ZK proofs or non-revocation witnesses and its status root is an opaque commitment only.

Eight unit tests are present in source, including authorization, malformed hash, issuer suspension, key-version rollback, status epoch monotonicity and state preservation during key rotation. GitHub Actions workflow was added for tests and wasm build. **No successful workflow result or local compilation has yet been observed**, and no Cargo.lock has been committed; dependency resolution is therefore not yet fully reproducible. This is a code-level preliminary audit, not an independent security review.
