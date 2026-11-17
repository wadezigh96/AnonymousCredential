> **Status update (2026-11-16):** The no-live-chain finding below describes the earlier audit point and is superseded for deployment only: the contract is now deployed at `registry.wkams.testnet` and `get_owner()` was verified. The verifier still has no live issuer-registration/acceptance evidence. See [deployment record](NEAR_TESTNET_DEPLOYMENT_2026-11-16.md).

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

## Audit findings at the audited HEAD

1. **High — No live-chain verification.** The contract was not deployed or queried on NEAR. Node registry integration evidence uses a deterministic local JSON-RPC mock; successful mock tests and a Wasm build do not establish deployed-contract compatibility or live RPC correctness.
2. **High — `status_root` is not revocation evidence.** The contract and client validate a hash-shaped opaque commitment and an optional minimum status epoch. No accumulator, revocation witness, or non-revocation proof is checked by this integration.
3. **High — RPC and verifier-configuration trust are implicit.** The verifier fetches `/public` once at startup and uses it for schema, credential definition, trusted capability-root key, policy, and defaults for issuer account/key-version/schema expectations (`packages/anoncreds-agent-demo/src/roles/verifier.mjs`). The NEAR client requests `finality: final` from the configured RPC and consumes the returned JSON-RPC bytes; it does not independently verify a NEAR state proof or block header. The `/public` source and RPC provider are therefore trust dependencies, not cryptographically authenticated inputs in this design.
4. **High — Stale cache could mask fresh semantic changes.** At the audited HEAD, stale fallback could return a cached record after most validation failures, including key-version or schema mismatch, and measured age using the timestamp captured before the network request. The follow-up working-tree changes described below restrict fallback to transient availability errors and evaluate age when fallback occurs.
5. **Moderate — Response-size check occurred after full buffering.** At the audited HEAD, the client called `arrayBuffer()` and only then checked the body size. A missing or understated `Content-Length` could therefore cause the full response to be buffered before rejection. Follow-up working-tree changes enforce the limit while streaming.
6. **Moderate — Centralized governance and demo key lifecycle.** Contract mutations are controlled by one owner account, without multisig or production governance. The issuer capability-root key remains an in-memory demo key; registry-bound issuer Ed25519 key persistence does not solve that separate trust-root lifecycle gap.

Historical SHA and workflow evidence are evidence-handling controls, not verifier defects; all CI claims in this audit remain tied to the exact audited HEAD above.

## Test and CI evidence

The following 81-test statement is historical evidence for the audited baseline, not the later local follow-up working tree result recorded below.

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

The original documentation-only reconciliation did not run local Cargo or Android commands, and this follow-up did not run them either; no local Cargo or Android result is represented as a pass.

## Follow-up hardening after the audited HEAD

The follow-up code changes add stale-cache eligibility/age checks, bounded streaming reads with body cancellation when declared or observed size exceeds the limit, semantic-mismatch regression coverage, and a process test that simulates a registry HTTP 503 then retries the same challenge and proof. These changes are not part of audited HEAD `8857ba2e91a781efe3792ef17230b4ee4ad6c31c` and are not covered by the six GitHub runs listed above. A separate local `npm test` result for these follow-up changes is recorded in the integration and deployment-readiness documents; it is not evidence of live NEAR behavior.

## Implementation surface reviewed

- `packages/anoncreds-agent-demo/src/near-issuer-registry.mjs` — read-only RPC client, record validation, cache, and bounded response handling.
- `packages/anoncreds-agent-demo/src/near-key-format.mjs` — Ed25519 raw-key and `ed25519:` Base58 conversion.
- `packages/anoncreds-agent-demo/src/issuer-key-store.mjs` and issuer role wiring — persisted registry-bound issuer key lifecycle.
- `packages/anoncreds-agent-demo/src/paai-verifier.mjs` and verifier role wiring — registry-backed authorization gate and trust bootstrap.
- Node tests for conversion, client failure modes, key lifecycle, verifier authorization, and mocked process integration.
- `contracts/near/issuer-registry/src/lib.rs` and contract tests — public metadata registry and owner-only mutation rules.

## Risks and compatibility constraints

- The registry record's `status_root` is an opaque commitment; this integration must not claim revocation or non-revocation proof support.
- The contract's view schema and `ed25519:` representation are protocol compatibility boundaries; changes require matching tests and documentation.
- Registry-dependent authorization must fail closed. No fallback to a local issuer key or stale cache is acceptable beyond an explicitly bounded freshness policy.
- No real contract account may be hardcoded, and no live RPC mutation or transaction is allowed.
- Existing demo behavior may remain only behind explicit development/test configuration; production-like registry mode must be configured explicitly.
- Rust validation is an environment blocker until a pinned toolchain is available; its absence cannot be reported as a pass.
