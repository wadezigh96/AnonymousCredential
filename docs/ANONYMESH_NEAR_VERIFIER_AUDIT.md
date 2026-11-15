# ANONYMESH NEAR Verifier Integration Audit

**Audit date:** 2026-11-15
**Repository:** `wadezigh96/anonymesh`
**Branch:** `feat/anonymesh-private-agent-identity`
**Audited HEAD:** `8857ba2e91a781efe3792ef17230b4ee4ad6c31c`
**Canonical commit:** https://github.com/wadezigh96/anonymesh/commit/8857ba2e91a781efe3792ef17230b4ee4ad6c31c

## Scope and safety boundary

The audit and implementation are restricted to the feature branch. No `main` changes, pull request, merge, NEAR deployment, chain transaction, registry mutation, or production secret use is permitted.

## Current architecture

The Node package at `packages/anoncreds-agent-demo` runs issuer, holder, and verifier roles as separate HTTP processes. The verifier validates an AnonCreds presentation, checks the issuer-attested Ed25519 agent key, verifies a signed delegated-capability chain and proof of possession, and atomically consumes SQLite-backed challenge/quota state. The verifier currently obtains schema, credential-definition, and trusted capability-root configuration from the issuer's `/public` endpoint.

The Rust contract at `contracts/near/issuer-registry` stores public issuer metadata keyed by NEAR account ID: `ed25519:` public key, monotonically increasing key version, schema hash, active flag, status epoch, and opaque status root. Its owner-only mutation and monotonicity rules are covered by unit tests. In explicit `NEAR_REQUIRED=true` mode, the Node verifier reads this view through a strict, read-only JSON-RPC client before entering the authorization transaction.

The Android app is explicitly a single-process native AnonCreds proof smoke test. It is not a separate-role wallet/verifier integration and must not be represented as one.

## Confirmed defects/gaps

1. The NEAR contract is not deployed or live-tested; all Node registry evidence uses deterministic local RPC mocks.
2. The opaque `status_root` is validated as a hash-shaped commitment but is not a revocation or non-revocation proof.
3. The issuer capability-root key remains an in-memory demo key; only the registry-bound issuer Ed25519 key has the persisted lifecycle needed by registry mode.
4. Historical documentation and workflow evidence must remain tied to their exact commit and must not be presented as evidence for later changes.

## Test and CI evidence

**Node test result reported by the final verification execution: 81 passed, 0 failed, 0 skipped, 0 todo.** The command was `npm test`, run from `packages/anoncreds-agent-demo`. The original local terminal output was not available in this documentation-only reconciliation, and that local execution was not rerun here.

Separate GitHub-hosted corroboration is available in [run 43737644575](https://github.com/wadezigh96/anonymesh/actions/runs/43737644575), job `anoncreds-native-demo`, step `Run issuer-holder-verifier and adversarial tests` (`npm test --prefix packages/anoncreds-agent-demo`). The inspected job log reports `# tests 81`, `# pass 81`, `# fail 0`, `# skipped 0`, and `# todo 0`; the test count is therefore supported by inspected job output, not inferred from workflow metadata alone.

The six verified GitHub Actions runs are:

| Workflow | Run |
|---|---|
| ANONYMESH AnonCreds integration | [43737644575](https://github.com/wadezigh96/anonymesh/actions/runs/43737644575) |
| ANONYMESH AnonCreds process integration | [43737647157](https://github.com/wadezigh96/anonymesh/actions/runs/43737647157) |
| ANONYMESH Linux ARM64 benchmark | [43737649929](https://github.com/wadezigh96/anonymesh/actions/runs/43737649929) |
| ANONYMESH Android native proof smoke test | [43737652777](https://github.com/wadezigh96/anonymesh/actions/runs/43737652777) |
| ANONYMESH agent authentication | [43737655482](https://github.com/wadezigh96/anonymesh/actions/runs/43737655482) |
| ANONYMESH NEAR contract | [43737658221](https://github.com/wadezigh96/anonymesh/actions/runs/43737658221) |

GitHub run metadata independently confirms for all six: `head_branch = feat/anonymesh-private-agent-identity`, `head_sha = 8857ba2e91a781efe3792ef17230b4ee4ad6c31c`, `status = completed`, `conclusion = success`, and `event = workflow_dispatch`. These Rust/WASM and Android checks are GitHub-hosted evidence, not local test executions. Workflow success does not establish live-chain correctness or production readiness.

Local Cargo/Android commands were not run in this documentation-only task; no local Cargo or Android result is represented as a pass.

## Files expected to change

- `packages/anoncreds-agent-demo/src/near-issuer-registry.mjs` (strict read-only RPC client and validation)
- `packages/anoncreds-agent-demo/src/near-key-format.mjs` (raw Ed25519 and `ed25519:` Base58 conversion)
- `packages/anoncreds-agent-demo/src/issuer-key-store.mjs` and issuer role wiring (only if stable persisted issuer identity is compatible with current demo protocol)
- `packages/anoncreds-agent-demo/src/paai-verifier.mjs` and verifier role wiring (registry-backed authorization gate)
- focused Node tests for conversion, client failure modes, key lifecycle, and real verifier authorization
- `.gitignore`/documentation only if required to protect the selected key-file convention
- `docs/ANONYMESH_NEAR_VERIFIER_INTEGRATION.md` plus the four named readiness/security/architecture/demo docs
- NEAR contract source/tests only if a demonstrated compatibility defect requires it

## Risks and compatibility constraints

- The registry record's `status_root` is an opaque commitment; this integration must not claim revocation or non-revocation proof support.
- The contract's view schema and `ed25519:` representation are protocol compatibility boundaries; changes require matching tests and documentation.
- Registry-dependent authorization must fail closed. No fallback to a local issuer key or stale cache is acceptable beyond an explicitly bounded freshness policy.
- No real contract account may be hardcoded, and no live RPC mutation or transaction is allowed.
- Existing demo behavior may remain only behind explicit development/test configuration; production-like registry mode must be configured explicitly.
- Rust validation is an environment blocker until a pinned toolchain is available; its absence cannot be reported as a pass.
