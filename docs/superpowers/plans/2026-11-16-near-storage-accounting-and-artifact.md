# NEAR Storage Accounting and Artifact Integration Implementation Plan

> **For agentic workers:** Execute this plan natively on the existing feature branch; do not deploy or send any NEAR transaction.

**Goal:** Make the issuer registry economically accountable for persistent mutations, publish an auditable release WASM artifact, preserve fail-closed registry behavior, and verify the exact final source SHA.

**Architecture:** Measure `env::storage_usage()` before and after each owner mutation. The transaction requires an attached deposit covering only positive storage growth at `env::storage_byte_cost()` and refunds excess deposit to the predecessor after the mutation. Underpayment panics and NEAR transaction rollback preserves state. The existing public method signatures remain unchanged.

**Tech Stack:** Rust 1.95, near-sdk 5.30.1, NEAR env storage APIs, GitHub Actions upload-artifact@v4, Node test suite.

**Spec:** User task in the current conversation, requirements 1–6.

## Global Constraints

- Never deploy or send a NEAR transaction.
- Preserve `feat/anonymesh-private-agent-identity`; do not modify main, merge, or open a PR.
- Keep existing contract method signatures compatible.
- Do not weaken existing validation or stale-cache fail-closed behavior.
- Do not expose secrets or private keys.
- Every final CI claim must reference the exact final source SHA.

## Review Focus

- Underpayment after a storage-growing issuer mutation must revert state; contract test asserts the issuer remains absent.
- Excess attached deposit must be refunded to the predecessor; tests assert the refund promise behavior where the NEAR test context exposes it and document the policy.
- Same-size and storage-shrinking mutations must not require a false positive deposit; tests cover activation/status updates.
- A stale cache must never mask semantic mismatches or malformed/unavailable registry reads in required mode; existing and new Node tests cover this.
- The WASM artifact must include source SHA, exact filename, reproducible command, and SHA-256 sidecar.

## Tasks

### Task 1: Contract storage accounting

**Files:**
- Modify: `contracts/near/issuer-registry/src/lib.rs`
- Test: `contracts/near/issuer-registry/src/lib.rs` unit tests

- [ ] Add a private mutation wrapper that records storage usage before/after, computes positive growth times `env::storage_byte_cost()`, rejects insufficient `env::attached_deposit()`, and refunds excess to `env::predecessor_account_id()` via a detached transfer.
- [ ] Route `register_issuer`, `set_issuer_active`, and `update_status_root` through the wrapper without changing public signatures.
- [ ] Update test context helpers with a sufficiently large attached deposit for successful growth tests.
- [ ] Add tests for underpayment rollback, successful first registration, key rotation, and no-growth mutation behavior.
- [ ] Keep owner handoff out of scope unless the API can be added without changing existing state compatibility and can be tested completely.

### Task 2: WASM artifact and checksum

**Files:**
- Modify: `.github/workflows/anonymesh-near-contract.yml`
- Modify: `contracts/near/issuer-registry/README.md`

- [ ] Upload the exact release WASM with `actions/upload-artifact@v4`.
- [ ] Generate `SOURCE_SHA.txt`, `BUILD_COMMAND.txt`, and `SHA256SUMS.txt` beside the WASM.
- [ ] Document artifact naming, build command, checksum retrieval, and the fact that no deployment occurs in CI.

### Task 3: Registry fail-closed verification

**Files:**
- Inspect/modify: `packages/anoncreds-agent-demo/src/near-issuer-registry.mjs`
- Test: `packages/anoncreds-agent-demo/test/near-issuer-registry.test.mjs`, `test/process-integration.test.mjs`

- [ ] Preserve transient-only stale-cache eligibility and streamed response limits.
- [ ] Add or retain tests proving outage, timeout, malformed response, semantic mismatch, and expired stale cache reject authorization in required mode.

### Task 4: Documentation and verification

**Files:**
- Modify: `docs/ANONYMESH_FINAL_INTEGRATION_REPORT.md`
- Modify: `docs/ANONYMESH_DEPLOYMENT_READINESS.md`
- Modify: contract/integration documentation as needed

- [ ] Record the actual implementation and CI evidence, including artifact metadata and checksum.
- [ ] Run the local Node suite and any available contract checks.
- [ ] Push the final source and dispatch all required workflows on that exact SHA.
- [ ] Report PASS/BLOCKED with deployment explicitly blocked until separate approval.
