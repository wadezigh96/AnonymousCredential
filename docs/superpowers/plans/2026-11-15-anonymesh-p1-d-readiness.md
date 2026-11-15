# ANONYMESH P1-D and Deployment Readiness Implementation Plan

> **For agentic workers:** Execute task-by-task; check off each verified step.

**Goal:** Harden and test HTTP abuse defenses, then verify cryptographic, authorization, contract, Android, CI, and deployment-readiness claims from repository evidence.

**Architecture:** Preserve the current issuer/holder/verifier design. Start with adversarial HTTP behavior and actual server integration; only fix reproduced defects. Continue by running existing security tests and auditing NEAR, Android, and cross-process lifecycle, documenting unresolved external-validation requirements rather than claiming unsupported readiness.

**Tech Stack:** Node.js 22 ESM and `node:test`; native AnonCreds wrapper; SQLite; Rust/NEAR SDK 5.30.1; Expo/React Native; GitHub Actions.

**Spec:** User-provided `pasted_content.txt` (GROK EXECUTION TASK — ANONYMESH P1-D SECURITY HARDENING & END-TO-END READINESS).

## Global Constraints

- Work only on `feat/anonymesh-private-agent-identity`; never modify `main`.
- No deploy, blockchain transaction, private key, production secret, public service, merge, or pull request.
- Reproduce before fixing, keep existing security tests, add focused regression tests, avoid unrelated refactors and dependencies.
- Report local tests, CI, testnet readiness, actual deployment, and mainnet readiness distinctly.
- Commit only reviewed changes after relevant tests pass; never push unless separately authorized.

## Review Focus

- Invalid/missing credentials must be independently rate-limited and never consume valid API quota; test both limits and IP isolation.
- Concurrent limiter requests and capacity/window boundaries must not escape or strand counters; test concurrency, expiry, and full capacity.
- Responses already committed, ended, or destroyed must not receive another status/body; test response-state mock and real HTTP behavior.
- Slow/incomplete headers and bodies, client disconnects, and pending shutdown must behave safely under effective server timeouts; exercise real sockets.
- Contract key/version/status transitions and Android/private-key claims must not be inferred beyond code/build/test evidence; test rejection and record unverified deployment/runtime conditions.

---

### Task 1: HTTP authentication abuse isolation and response safety

**Files:**
- Modify: `packages/anoncreds-agent-demo/src/roles/http.mjs`
- Modify: `packages/anoncreds-agent-demo/src/roles/issuer.mjs`, `holder.mjs`, `verifier.mjs` only if routing order requires it
- Test: `packages/anoncreds-agent-demo/test/http-rate-limit.test.mjs`
- Test: `packages/anoncreds-agent-demo/test/http-abuse-protection.test.mjs`

**Interfaces:** Keep the shared HTTP helpers compatible with all three roles. Add distinct authentication-failure limiter(s) keyed only by socket remote address; keep successful-auth endpoint limiters separate.

- [ ] Add failing cases for repeated missing/invalid tokens, valid access after failures, distinct IPs, concurrent failures, window expiry, and capacity exhaustion.
- [ ] Run focused tests and confirm the regressions fail.
- [ ] Implement dedicated bounded auth-failure throttling, timing-safe token comparison, and safe handling of `destroyed`, `writableEnded`, and `headersSent` responses.
- [ ] Add response-state cases to the realistic recorder and verify focused tests pass.
- [ ] Run the whole HTTP test set and inspect the diff.

### Task 2: Real HTTP timeout and request-abuse integration

**Files:**
- Modify: `packages/anoncreds-agent-demo/test/http-abuse-protection.test.mjs`
- Modify: `packages/anoncreds-agent-demo/test/process-integration.test.mjs` only if role-level socket tests need shared helpers
- Modify: `packages/anoncreds-agent-demo/src/roles/http.mjs` only for reproduced runtime defects

**Interfaces:** Use actual issuer, holder, and verifier HTTP servers; preserve `configureHttpServer` limits and assert network-observed outcomes.

- [ ] Add real-socket tests for incomplete/slow headers, incomplete JSON, request timeout, client disconnect, and shutdown with pending requests.
- [ ] Verify actual issuer, holder, and verifier servers all receive configured timeout values.
- [ ] Run focused tests; fix only reproducible failures and rerun them.
- [ ] Preserve and verify 1 MiB request limit, 413, malformed JSON 400, non-JSON 415, sanitized 500, bearer auth, and endpoint rate limiting.

### Task 3: Security regression and end-to-end verification

**Files:**
- Test existing files under `packages/anoncreds-agent-demo/test/`; modify only when a regression test exposes a real defect.

**Interfaces:** No redesign; confirm native issuance, holder proof, verifier authorization, persistent SQLite state, replay controls, concurrency, and quota.

- [ ] Run targeted HTTP, SQLite atomic authorization, replay, quota/restart, process-integration, native AnonCreds, and benchmark commands.
- [ ] Reproduce each failure, capture logs, fix root cause, add regression coverage, rerun focused and full relevant suites.
- [ ] Explicitly state the boundary of rollback tests and whether they exercise the production authorization transaction path.

### Task 4: NEAR issuer registry evidence audit

**Files:**
- Inspect: `contracts/near/issuer-registry/{src/lib.rs,Cargo.toml,Cargo.lock,README.md}` and `.github/workflows/anonymesh-near-contract.yml`
- Modify source/tests only for demonstrated security or correctness gaps.

- [ ] Verify registration, Ed25519 parsing, authorization, disable/revoke, duplicate/key rotation, storage, initialization, ownership, input bounds, return/events, and error behavior against actual code/tests.
- [ ] Run `cargo test --locked` and the configured Wasm target release build.
- [ ] Report artifact/build evidence and clearly separate local unit tests from testnet compatibility; do not deploy.

### Task 5: Android integration evidence audit

**Files:**
- Inspect: `apps/android/App.tsx`, `package.json`, app config, README, and Android workflow.

- [ ] Run dependency compatibility check and TypeScript checks; run available Android build/tests or report exact environmental blocker.
- [ ] Verify whether issuer/holder/verifier, secure persistent credential storage, link-secret lifecycle, registry interaction, and private-data protections are implemented or only demo claims.
- [ ] Report APK artifact and physical-device/runtime limitations without claiming production readiness from a single-process smoke test.

### Task 6: Final verification, readiness matrix, and commit

**Files:**
- Create/update: a concise readiness evidence report under `docs/` only if results are verified.
- Commit only verified implementation changes on the target branch.

- [ ] Run relevant complete test suites, inspect `git diff`, and scan staged changes for secrets.
- [ ] Capture current GitHub Actions runs and links; distinguish historical failures from latest state.
- [ ] Produce the A–G component readiness matrix with implementation, tests, integration, artifacts, blockers, evidence, and commit SHA.
- [ ] Commit scoped changes after relevant suites pass; confirm branch, HEAD, working-tree state, and that no deploy/merge/transaction occurred.
