> **Superseded deployment decision (2026-11-16):** The NEAR issuer registry has since been deployed and initialized at `registry.wkams.testnet` (owner `wkams.testnet`); `get_owner()` was verified. Deployment transaction: [NEAR Explorer](https://explorer.testnet.near.org/transactions/DrFYWN8Kx25f3265ydvJNyfUpiPT9GpjMiQJJMBJXJYHD). This historical readiness assessment remains useful for its source/CI findings, but its pre-deployment verdict is no longer current. Issuer registration and live verifier acceptance remain pending; see [current project status](PROJECT_STATUS.md).

# ANONYMESH Deployment Readiness Evidence

**Audit date:** 2026-11-15  
**Repository:** `wadezigh96/anonymesh`  
**Branch:** `feat/anonymesh-private-agent-identity`  
**Audited CI evidence HEAD:** `8857ba2e91a781efe3792ef17230b4ee4ad6c31c`
**Canonical commit:** https://github.com/wadezigh96/anonymesh/commit/8857ba2e91a781efe3792ef17230b4ee4ad6c31c
**Deployment decision:** **TESTNET NOT READY**
**Scope:** CI evidence review at the audited SHA plus a separately labeled local working-tree follow-up. No deployment, NEAR transaction, merge, pull request, or mainnet action was performed.

## Executive summary

Six GitHub Actions workflow runs are recorded as completed successfully on the exact audited final branch HEAD. Their names identify the AnonCreds integration, process integration, Linux ARM64 benchmark, Android native proof smoke test, agent authentication, and NEAR contract workflows. Run metadata alone does not attest to every job detail or artifact, and none of these runs is live-chain evidence.

The decision remains **TESTNET NOT READY**. Successful CI does not establish testnet readiness, production readiness, or live-chain correctness. The Node verifier has an explicit registry-backed mode that reads a finality view through a narrow read-only RPC client and fails closed on trust or freshness errors. The NEAR contract remains a preliminary public-metadata registry, and the Android app remains a single-process native proof smoke test. Production governance, transport security, distributed state, privacy-preserving revocation, and action execution controls remain incomplete.

## 1. Git and CI evidence

All six run records below were independently checked through GitHub run metadata. For every run: `head_branch = feat/anonymesh-private-agent-identity`, `head_sha = 8857ba2e91a781efe3792ef17230b4ee4ad6c31c`, `status = completed`, `conclusion = success`, and `event = workflow_dispatch`. These were not triggered by a push or pull request.

| Workflow | Metadata result | Evidence |
|---|---:|---|
| ANONYMESH AnonCreds integration | `completed` / `success` | [Run 43737644575](https://github.com/wadezigh96/anonymesh/actions/runs/43737644575) |
| ANONYMESH AnonCreds process integration | `completed` / `success` | [Run 43737647157](https://github.com/wadezigh96/anonymesh/actions/runs/43737647157) |
| ANONYMESH Linux ARM64 benchmark | `completed` / `success` | [Run 43737649929](https://github.com/wadezigh96/anonymesh/actions/runs/43737649929) |
| ANONYMESH Android native proof smoke test | `completed` / `success` | [Run 43737652777](https://github.com/wadezigh96/anonymesh/actions/runs/43737652777) |
| ANONYMESH agent authentication | `completed` / `success` | [Run 43737655482](https://github.com/wadezigh96/anonymesh/actions/runs/43737655482) |
| ANONYMESH NEAR contract | `completed` / `success` | [Run 43737658221](https://github.com/wadezigh96/anonymesh/actions/runs/43737658221) |

The following 81-test statement is the historical audited-baseline result; the later working-tree result is reported separately below and in the integration document.

**Node test result reported by the final verification execution: 81 passed, 0 failed, 0 skipped, 0 todo.** The command was `npm test` from `packages/anoncreds-agent-demo`. The original local terminal output was not available in this documentation-only reconciliation, and the local execution was not rerun here.

Separately, the inspected GitHub Actions log for [run 43737644575](https://github.com/wadezigh96/anonymesh/actions/runs/43737644575), job `anoncreds-native-demo`, step `Run issuer-holder-verifier and adversarial tests`, records `npm test --prefix packages/anoncreds-agent-demo` and reports `# tests 81`, `# pass 81`, `# fail 0`, `# skipped 0`, and `# todo 0`. This specific count is supported by inspected job output, not inferred from the run metadata.

### Follow-up working-tree changes (not covered by the six runs)

After the audited SHA, local follow-up changes tightened stale-cache fallback, enforced the RPC body-size limit while streaming (including early cancellation when `Content-Length` alone exceeds the limit), and added cache-regression and mocked process-failure/retry tests. The full `npm test` run from `packages/anoncreds-agent-demo` passed 86 tests (0 failed, 0 skipped, 0 todo) on 2026-11-16. This is local evidence for the follow-up changes only, not CI evidence for their commit and not live-chain evidence. Review fresh CI for the follow-up commit before relying on it.

### Artifact and live-chain evidence limits

This reconciliation verified the six run metadata records and inspected the Node job log noted above. It did not independently inspect Android, ARM64, agent-auth, or NEAR job logs or artifacts. Artifact IDs, sizes, APK digests, physical-device behavior, and detailed Rust/WASM outcomes are not asserted here as evidence for the final SHA based on metadata alone. No testnet contract deployment or on-chain method invocation was performed.

## 2. Component readiness matrix

| Component | Implemented evidence | Current status | Remaining gate |
|---|---|---|---|
| Node AnonCreds issuer/holder/verifier demo | Native Node wrapper, final CI integration and separate-process workflow | Demo CI PASS | Does not equal production service deployment |
| HTTP authentication and abuse controls | Bearer authentication, dedicated authentication-failure limiter, endpoint rate limits, body bounds, timeouts, sanitized errors | CI PASS | TLS, service identity, shared/distributed rate limiting, operational monitoring |
| SQLite verifier state | Persistent challenge and authorization stores; owner-only DB file mode; restart/concurrency tests | CI PASS | Backups, retention/cleanup, crash recovery, multi-host/distributed DB validation |
| Agent authentication | Rust Ed25519 challenge-response tests | CI PASS | Key lifecycle, integration with production agent runtime |
| Delegated capabilities | Signature/scope/quota verification code and tests | Prototype / demo integration | Production policy engine, action receipts, retry/idempotency and external tool enforcement |
| NEAR issuer registry + Node read path | Contract metadata plus strict Node `ed25519:` conversion, bounded read-only RPC client, credential-bound issuer key/version/schema checks, mocked-RPC process integration | Node and NEAR CI PASS; chain not deployed | Contract review, storage/governance review, testnet deployment approval |
| Android app | Single-process native proof smoke test | Workflow metadata success; current job log/artifact not inspected | Physical-device test of an APK built from this exact SHA, plus multi-role protocol and secure persistent wallet integration |
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

The Node verifier now enforces a registry record when `NEAR_REQUIRED=true`; the final process test uses a deterministic local JSON-RPC mock, not a deployed contract. A successful mock integration or historical Wasm build does not prove live deployed-contract behavior.

### Android

The current `apps/android/App.tsx` explicitly describes a local single-process proof demonstration. It creates a demo credential, keeps the link secret in memory, reveals a role and checks a hidden expiry predicate. It explicitly warns that issuer, holder and verifier are not separate security domains.

The Android workflow run metadata reports success, but its current job log and artifacts were not inspected in this reconciliation. It does not establish the full issuer-holder-verifier protocol, durable secure wallet storage, registry access or physical-device behavior for an APK built from this exact SHA.

### Privacy and authorization limits

The repository's existing security/architecture documentation identifies important non-guarantees: no proven repeated-presentation unlinkability, no privacy-preserving revocation, no human uniqueness, no production-grade local agent runtime, and no production tool sandbox. The demo's capability and AnonCreds proof paths must not be described as a complete cryptographic binding unless that binding is implemented and tested as one end-to-end protocol.

## 4. Documentation consistency warning

Some existing documentation predates the latest HTTP security work. In particular, older sections still describe the role endpoints as lacking bearer authentication and rate limits, while the current source and P1-D CI tests include these controls. Review and synchronize `docs/SECURITY_LIMITATIONS.md`, `docs/ANONYMESH_ARCHITECTURE.md`, and `docs/TESTNET_DEMO.md` before using them as a current public security statement.

Do not remove the documented limitations about TLS, distributed rate limiting, revocation, unlinkability, Android integration, or production policy enforcement.

## 5. Safe next steps before a testnet deployment request

1. Preserve the final branch evidence and rerun CI after any future code change.
2. Review contract storage economics, account funding, initialization arguments, owner account, gas/deposit requirements and emergency disable procedure.
3. Decide whether the first testnet deployment is only a registry smoke test or part of an actual end-to-end verifier flow; the verifier path is integrated, but live RPC/deployed-contract evidence is still absent.
4. Re-run the final branch CI after any further code change; do not treat this evidence as immutable after new commits.
5. Verify the exact APK on a physical Android device and capture the full APK SHA-256, device ABI and runtime output.
6. Complete an independent security review of the remaining rate-limiter, storage, privacy and authorization boundaries.
7. Prepare a transaction preflight containing network, signer, receiver, method, arguments, deposit, gas, expected state change and rollback/disable plan. Show it to the owner and wait for explicit approval.

## 6. Explicit deployment boundary

**No deployment was performed. No NEAR testnet or mainnet transaction was sent. No contract was initialized. No production secret or private key was used. No merge or pull request was created. The deployment decision remains TESTNET NOT READY.**

The evidence supports: **the six named GitHub Actions runs have completed successfully on the exact audited final SHA; the Node job log reports 81 tests passed.** The run metadata does not prove live-chain behavior, artifact contents, or production readiness.

It does not support: **production-ready, fully integrated, anonymous/unlinkable identity, revocation-complete, or mainnet-ready.**
