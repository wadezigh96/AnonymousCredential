# ANONYMESH — Cryptographic Stack Evaluation

Review date: 2026-11-14
Status: **provisional engineering decision for a local prototype; not a production approval and not an implementation claim.**

## Decision summary

Keep AnonCreds v1 / `anoncreds-rs` as the preferred protocol candidate, but **do not integrate the Rust crate yet**. The current upstream v0.2.3 dependency graph has a reproducible Cargo resolution blocker: `anoncreds-clsignatures 0.3.2` depends on `glass_pumpkin 1.6.x`, which requires the yanked `core2 0.4.0`. Upstream issue #372 remains open, and docs.rs also records a failed build for `anoncreds-clsignatures 0.3.2`. Resolve this upstream dependency issue or verify an officially supported build artifact before adding the crate. Keep the application behind a protocol adapter so a later migration or second backend remains possible.

Do not yet integrate AnonCreds v2 or W3C BBS into the production protocol. Keep AnonCreds v2 as the leading next-generation research candidate and BBS as an interoperability candidate. This decision is based on current implementation maturity and Android build evidence, not a claim that v1 has the strongest cryptography or is the best long-term scheme.

**No cryptographic dependency has been added to this repository.** No code or tests are implemented by this decision record.

## Evaluation criteria

1. Maintained implementation and security disclosure process.
2. Issuer-holder-verifier lifecycle and interoperable data model.
3. Selective disclosure, predicates and holder binding.
4. Unlinkability and privacy-preserving revocation.
5. Android ARM64 feasibility and local-first holder operation.
6. Clear versioning, test suite, release and migration evidence.
7. Compatibility with an application-layer challenge-response and delegated capability model.

## Candidate comparison

| Candidate | Useful capabilities | Evidence and limitations | ANONYMESH decision |
|---|---|---|---|
| AnonCreds v1 / `anoncreds-rs` | Blind issuance, link-secret holder binding, selective disclosure, integer predicates, unlinkable presentations and ZK non-revocation proofs | Spec v1.0 is still labelled Draft. Rust reference implementation has issuer/prover/verifier APIs and Android CI targets including `aarch64-linux-android`. v0.2.3 is the current release identified in the source review. GitHub advisory GHSA-89r4-4c4j-7wx9 is verified: it affects `anoncreds-rs` 0.2.2 and lists 0.2.3 as patched. The advisory describes a verifier flaw that could accept a presentation combining credentials with different link secrets. The advisory page lists no CVE ID; do not repeat the previously associated `CVE-2025-67498` as verified. The separate Cargo build blocker still applies to v0.2.3. Revocation requires status data, tails/witness management and careful metadata analysis. | **Preferred protocol, blocked crate integration** until the yanked transitive dependency is resolved and reproducibly built. |
| AnonCreds v2 / `anoncreds-v2-rs` | Pluggable BBS and PS signature suites; selective disclosure; unlinkable signatures; positive integer predicates, signed expressions, range/domain/set proofs, verified encryption, cross-credential equality; ALLOSAUR revocation | Its own README describes the current code as a toolkit and says a comprehensive opinionated interoperable specification and reference implementation is still a future goal. Active repository evidence exists, but Android ARM64 support and an independent security audit were not established in this review. | **Leading next-generation research candidate**, not initial dependency. Reassess after stable APIs, test vectors, platform builds and security review. |
| W3C Data Integrity BBS Cryptosuite | Selective disclosure and unlinkable derived proofs from BBS signatures; optional holder-binding/pseudonym feature options in the draft | W3C document is a Candidate Recommendation Draft dated 2026-09-10. The interoperability report describes the technology as experimental; its published test results include skipped/pending and failed cases. The suite itself does not provide AnonCreds-style native integer predicate proofs or a complete revocation design. | **Interoperability candidate**, not sole ANONYMESH credential engine today. |
| SD-JWT VC | Compact selectively disclosable signed claims and broad JOSE ecosystem compatibility | Ordinary SD-JWT selective disclosure is not by itself a zero-knowledge unlinkable derived-proof system; it does not satisfy ANONYMESH's privacy goals alone. | **Not sufficient as the primary cryptographic engine**. Could be an explicitly lower-privacy compatibility format if ever required. |

## Security advisory verification gate

The official GitHub advisory [GHSA-89r4-4c4j-7wx9](https://github.com/anoncreds/anoncreds-rs/security/advisories/GHSA-89r4-4c4j-7wx9) was verified. It lists `anoncreds-rs` 0.2.2 as affected and 0.2.3 as patched, for a verifier flaw involving mixed link secrets. The advisory page does not list a CVE ID. A previously associated CVE-2025-67498 label is not verified and must not be used.

Therefore:
- v0.2.3 is the patched release for GHSA-89r4-4c4j-7wx9, but it is **not currently build-approved** because upstream issue [#372](https://github.com/anoncreds/anoncreds-rs/issues/372) documents Cargo resolution failure through the yanked `core2 0.4.0` dependency.
- The release page has a prebuilt `library-ios-android.tar.gz` artifact (~79.6 MB), but using a prebuilt native library is a different integration path from building the Rust crate in Termux. Its ABI, Android architecture, wrapper compatibility and artifact provenance still require verification.
- Before dependency adoption, independently verify all published advisories for `anoncreds-rs` and `anoncreds-clsignatures`, including affected and fixed ranges.
- Add regression tests for cross-link-secret credential mixing and other holder-binding invariants, regardless of whether an advisory is confirmed.
- Pin the exact dependency version and commit/checksum in the eventual lockfile; do not float to an unreviewed version.
- Re-review advisories and release notes before every dependency upgrade.

## Android ARM64 feasibility

The v0.2.3 release includes a prebuilt combined iOS/Android archive, but the current upstream `.github/workflows/build.yml` inspected here does not show Android in its active source-build matrix. The release archive is not proof of a working Termux/aarch64 integration. The JavaScript/React Native wrapper is a separate native-binding project; its README states Node.js 18.x was tested, so the user's Node.js 26.x environment is not a verified compatibility target.

ANONYMESH must still test the selected version on a clean Android ARM64 environment, measure memory and latency, and verify secret handling. Do not assume a React Native wrapper is directly usable from Termux or that Node FFI is safe for the holder runtime.

## NEAR boundary

AnonCreds v1 is ledger-agnostic: its verifiable data registry can be a ledger, web service, database or other registry. NEAR should therefore be an adapter for issuer keys, schema/credential-definition references and versioned public status commitments, not a requirement inside the cryptographic core. Never put holder secrets, raw claims, credential IDs or presentation events into public NEAR state.

NEAR smart-contract storage is public and storage writes require storage funding. Keep personal and presentation data off-chain. Start with off-chain credential verification and read-only test vectors; do not deploy or send transactions as part of this phase.

## Required implementation gates

Before adopting the candidate in code:

1. Fetch and pin exact source release/tag and verify its signed release/commit provenance.
2. Review `Cargo.toml`, `Cargo.lock`, transitive cryptographic dependencies, feature flags, unsafe blocks/FFI, zeroization and secret lifetime handling.
3. Run upstream tests and the AnonCreds interoperability/test vectors in a reproducible Linux environment.
4. Add regression tests for cross-link-secret credential mixing, issuer mismatch, credential substitution, altered claims, expired credential, revoked credential, malformed presentation, nonce replay and audience/task mismatch.
5. Build the exact version for Android ARM64; measure proof generation/verification p50/p95, peak memory, proof size and CPU.
6. Test witness/status refresh and quantify privacy leakage from status-list fetches, timing, network metadata and rare disclosed claims.
7. Obtain independent cryptographic review before production claims.

## References

- [AnonCreds v1.0 specification](https://hyperledger.github.io/anoncreds-spec/) — currently labelled Draft; describes selective disclosure, predicates, link-secret binding and non-revocation proofs.
- [anoncreds-rs repository](https://github.com/anoncreds/anoncreds-rs) — Rust reference implementation and issuer/prover/verifier APIs.
- [anoncreds-rs v0.2.3 release](https://github.com/anoncreds/anoncreds-rs/releases/tag/v0.2.3) — includes a combined iOS/Android binary archive.
- [anoncreds-rs issue #372](https://github.com/anoncreds/anoncreds-rs/issues/372) — unresolved yanked `core2` dependency resolution report.
- [docs.rs build record for anoncreds-clsignatures 0.3.2](https://docs.rs/crate/anoncreds-clsignatures/latest/builds/3495948) — dependency resolution failed due to yanked `core2`.
- [AnonCreds JavaScript / React Native wrapper](https://github.com/anoncreds/anoncreds-wrapper-javascript) — separate wrapper repository.
- [AnonCreds v2 toolkit](https://github.com/anoncreds/anoncreds-v2-rs) — BBS and PS suite toolkit; broader interoperable specification remains future work in its README.
- [W3C BBS Cryptosuites v1.0 Candidate Recommendation Draft](https://www.w3.org/TR/2026/CRD-vc-di-bbs-20260910/).
- [W3C BBS interoperability report](https://w3c.github.io/vc-di-bbs-test-suite/) — experimental report, not a normative standard.
- [NEAR smart-contract storage documentation](https://docs.near.org/smart-contracts/anatomy/storage) — on-chain state is public.

## Explicit non-claims

This evaluation is not an independent cryptographic audit. The patched-version advisory and the separate build blocker are distinct findings: patching the verifier flaw does not resolve Cargo dependency availability. No formal proof, successful Termux/Android build, performance benchmark, NEAR gas measurement or privacy assessment has been completed by ANONYMESH. The provisional choice can be changed if implementation testing fails.