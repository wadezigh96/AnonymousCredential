# Repository audit — AnonymousCredential / ANONYMESH

Date: 2026-11-14
Branch inspected: `feat/anonymesh-private-agent-identity`
Default branch inspected: `main`

## 1. Current feature-branch tree

The inspected feature branch contains:
- `README.md`
- `docs/AUDIT.md`
- `docs/THREAT_MODEL.md`

The paths `circuits/anonymesh_membership.circom` and `contracts/AnonMeshRootRegistry.sol` are absent. They were deliberately removed after being identified as premature, unvalidated prototypes.

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
| NEAR contracts and tests | Not present |
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