# ANONYMESH Deployment Readiness Evidence

**Audit date:** 2026-11-15  
**Repository:** `wadezigh96/anonymesh`  
**Branch:** `feat/anonymesh-private-agent-identity`  
**Audited HEAD:** `702731d3c3aa34b00048321c001fe4272fa9a1d7`  
**Branch HEAD checked against GitHub:** exact match  
**Scope:** Evidence review only. No deployment, NEAR transaction, merge, pull request, or mainnet action was performed.

## Executive summary

The audited feature-branch HEAD has six successful GitHub Actions workflow runs, all attached to the same commit SHA. The CI evidence covers the Node AnonCreds suite, process integration, Rust agent-auth tests, Linux ARM64 benchmark, Android release APK build, and NEAR contract unit tests plus Wasm release build.

This is **CI/build readiness for a testnet integration phase**, not production readiness and not proof that the complete ANONYMESH system is integrated end-to-end. The NEAR contract remains a preliminary public-metadata registry. The Android app remains a single-process native proof smoke test. The contract is not currently wired into the issuer/verifier request path, and production governance, transport security, distributed state, privacy-preserving revocation, and action execution controls remain incomplete.

## 1. Git and CI evidence

All six runs below completed with conclusion `success` and exact `head_sha` `702731d3c3aa34b00048321c001fe4272fa9a1d7`.

| Workflow | Result | Evidence |
|---|---:|---|
| ANONYMESH AnonCreds integration | PASS — 70 tests, 0 failures | [Run 43727035793](https://github.com/wadezigh96/anonymesh/actions/runs/43727035793) |
| ANONYMESH AnonCreds process integration | PASS — 11 tests, 0 failures | [Run 43727035813](https://github.com/wadezigh96/anonymesh/actions/runs/43727035813) |
| ANONYMESH agent authentication | PASS — 21 Rust tests, 0 failures | [Run 43727313583](https://github.com/wadezigh96/anonymesh/actions/runs/43727313583) |
| ANONYMESH Linux ARM64 benchmark | PASS — native ARM64 runner and benchmark artifact uploaded | [Run 43727035797](https://github.com/wadezigh96/anonymesh/actions/runs/43727035797) |
| ANONYMESH Android native proof smoke test | PASS — Gradle release build, embedded JS bundle verification, APK upload | [Run 43727318942](https://github.com/wadezigh96/anonymesh/actions/runs/43727318942) |
| ANONYMESH NEAR contract | PASS — 21 Rust tests, Wasm release build | [Run 43727324756](https://github.com/wadezigh96/anonymesh/actions/runs/43727324756) |

### Android artifact

- Artifact: `anonymesh-android-standalone-release`
- GitHub artifact ID: `14167650395`
- Uploaded archive size: `40,103,932` bytes
- Artifact was present and not expired when checked.
- The workflow log confirms `BUILD SUCCESSFUL`, a non-empty `index.android.bundle`, and successful artifact upload.
- Manus reported downloading an APK of `97,338,555` bytes and a SHA-256 beginning `a2f4` and ending `74e2`. The full digest was not included in the Manus handoff and has not been independently recomputed here. Treat that abbreviated digest as unverified.

### Linux ARM64 benchmark artifact

- Artifact: `anonymesh-linux-arm64-benchmark`
- GitHub artifact ID: `14166882278`
- Uploaded archive size: `510` bytes
- The workflow explicitly checks that the runner architecture is ARM64/aarch64. This is Linux ARM64 evidence, not Android performance evidence.

### NEAR contract CI

- The latest workflow ran `cargo test --locked`: 21 passed, 0 failed.
- The locked Wasm release build completed successfully.
- No Wasm artifact was retained by this workflow; the successful build is evidenced by the completed job log.
- This is source/build evidence only. No testnet contract deployment or on-chain method invocation was performed.

## 2. Component readiness matrix

| Component | Implemented evidence | Current status | Remaining gate |
|---|---|---|---|
| Node AnonCreds issuer/holder/verifier demo | Native Node wrapper, 70-test CI suite, separate-process integration suite | Demo CI PASS | Does not equal production service deployment |
| HTTP authentication and abuse controls | Bearer authentication, dedicated authentication-failure limiter, endpoint rate limits, body bounds, timeouts, sanitized errors | CI PASS | TLS, service identity, shared/distributed rate limiting, operational monitoring |
| SQLite verifier state | Persistent challenge and authorization stores; owner-only DB file mode; restart/concurrency tests | CI PASS | Backups, retention/cleanup, crash recovery, multi-host/distributed DB validation |
| Agent authentication | Rust Ed25519 challenge-response tests | CI PASS | Key lifecycle, integration with production agent runtime |
| Delegated capabilities | Signature/scope/quota verification code and tests | Prototype / demo integration | Production policy engine, action receipts, retry/idempotency and external tool enforcement |
| NEAR issuer registry | Owner-controlled issuer metadata, Ed25519 key parsing, key versions, active status, monotonic status root; 21 tests and Wasm build | Build/test PASS; not deployed | Contract review, storage funding policy, governance/multisig, testnet deployment and live RPC integration |
| Android app | Expo compatibility, native prebuild, release APK and embedded JS bundle | Build PASS | Physical-device test of this exact APK, plus multi-role protocol and secure persistent wallet integration |
| Privacy and revocation | Selective disclosure and hidden expiry predicate in demo | Partial demo | Unlinkability study, credential-to-agent-key binding, privacy-preserving revocation and non-revocation proof |

## 3. Security and architecture findings

### HTTP service boundary

The current Node role servers now require bearer tokens for sensitive endpoints and apply separate IP-based authentication-failure and endpoint rate limits. JSON requests are bounded to 1 MiB, content type is checked, Node HTTP timeout properties are configured, and internal errors are sanitized.

Important residual limitations:

- Rate-limit buckets are in-memory and per process, not shared across instances.
- The limiter iterates its bucket map during request handling; this is a potential scaling/DoS concern at high cardinality.
- Bearer tokens authenticate access to demo services; they are not cryptographic per-agent identity credentials.
- The services default to loopback. Public exposure requires TLS, secret management, network policy and operational controls.

### SQLite state

The verifier opens its SQLite state with restrictive file permissions and a restrictive process umask. CI verifies the database file mode and the process integration tests exercise shared local SQLite state and restart behavior.

This does not establish safe operation over network filesystems, multi-host failover or a distributed database. A production deployment still needs backup, retention, recovery and monitoring procedures.

### NEAR registry contract

The contract currently stores public issuer metadata: issuer account, Ed25519 public key, key version, schema hash, active flag, status epoch and status root. Mutating methods are owner-only; key versions and status epochs must increase.

The contract README explicitly states that the status root is an opaque commitment. The contract does not verify AnonCreds/BBS/ZK proofs, does not implement a privacy-preserving accumulator, and does not validate non-revocation witnesses on-chain. Governance is a single owner in this first slice.

The contract is not yet an end-to-end authorization dependency of the Node verifier. A successful Wasm build does not prove live RPC integration or deployed contract behavior.

### Android

The current `apps/android/App.tsx` explicitly describes a local single-process proof demonstration. It creates a demo credential, keeps the link secret in memory, reveals a role and checks a hidden expiry predicate. It explicitly warns that issuer, holder and verifier are not separate security domains.

The CI workflow proves a standalone APK can be built and contains a non-empty JavaScript bundle. It does not prove the full issuer-holder-verifier protocol, durable secure wallet storage, registry access or physical-device behavior for this exact newly built artifact.

### Privacy and authorization limits

The repository's existing security/architecture documentation identifies important non-guarantees: no proven repeated-presentation unlinkability, no privacy-preserving revocation, no human uniqueness, no production-grade local agent runtime, and no production tool sandbox. The demo's capability and AnonCreds proof paths must not be described as a complete cryptographic binding unless that binding is implemented and tested as one end-to-end protocol.

## 4. Documentation consistency warning

Some existing documentation predates the latest HTTP security work. In particular, older sections still describe the role endpoints as lacking bearer authentication and rate limits, while the current source and P1-D CI tests include these controls. Review and synchronize `docs/SECURITY_LIMITATIONS.md`, `docs/ANONYMESH_ARCHITECTURE.md`, and `docs/TESTNET_DEMO.md` before using them as a current public security statement.

Do not remove the documented limitations about TLS, distributed rate limiting, revocation, unlinkability, Android integration, or production policy enforcement.

## 5. Safe next steps before a testnet deployment request

1. Reconcile the stale documentation with the current source and this evidence report.
2. Review contract storage economics, account funding, initialization arguments, owner account, gas/deposit requirements and emergency disable procedure.
3. Implement and test verifier-side issuer-registry lookup with fail-closed behavior, including inactive issuer, wrong key version, stale status epoch and RPC failure.
4. Decide whether the first testnet deployment is only a registry smoke test or part of an actual end-to-end verifier flow. Do not claim the latter until integrated.
5. Verify the exact APK on a physical Android device and capture the full APK SHA-256, device ABI and runtime output.
6. Complete an independent security review of the remaining rate-limiter, storage, privacy and authorization boundaries.
7. Prepare a transaction preflight containing network, signer, receiver, method, arguments, deposit, gas, expected state change and rollback/disable plan. Show it to the owner and wait for explicit approval.

## 6. Explicit deployment boundary

**No deployment was performed. No NEAR testnet or mainnet transaction was sent. No contract was initialized. No production secret or private key was used. No merge or pull request was created.**

The evidence supports: **feature-branch CI green and NEAR Wasm build successful; ready for final integration review and an explicitly approved testnet deployment plan.**

It does not support: **production-ready, fully integrated, anonymous/unlinkable identity, revocation-complete, or mainnet-ready.**
