# AnonMesh Live Testnet Issuer Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menyelesaikan integrasi issuer AnonCreds persisten dengan registry NEAR Testnet `registry.wkams.testnet`, lalu membuktikan alur issuer–holder–verifier live tanpa mengekspos material privat.

**Architecture:** Issuer memakai Ed25519 JWK privat persisten dan state AnonCreds persisten, tetapi mempublikasikan kunci registry dalam bentuk canonical `ed25519:<Base58>` yang sama dengan kontrak. Tool registrasi terpisah membaca metadata publik issuer, membentuk payload owner-only, meminta signer aman melalui mekanisme yang tersedia, menunggu finality, lalu melakukan read-back. Verifier tetap fail-closed dan dikonfigurasi dengan pin eksplisit terhadap issuer account, key version, schema hash, dan RPC Testnet.

**Tech Stack:** Node.js 22 ESM, `@hyperledger/anoncreds-nodejs`, Rust/near-sdk contract, NEAR JSON-RPC finality, Node built-in test runner, GitHub Actions.

**Spec:** `/home/ubuntu/upload/pasted_content.txt` (MANUS EXECUTION TASK — ANONYMESH LIVE TESTNET ISSUER INTEGRATION)

## Global Constraints

- Network hanya NEAR Testnet; tidak boleh ada mainnet action.
- Tidak pernah meminta, mencetak, atau commit seed phrase, private JWK, secret key, token, atau credential secret.
- Tidak membuat identitas produksi baru bila identity/state persisted sudah ada.
- Mutasi chain hanya melalui owner `wkams.testnet`, dan hanya setelah signer aman serta payload/biaya tersedia.
- PR #1 harus tetap OPEN dan Draft; tidak merge.
- Mock RPC hanya bukti lokal, bukan bukti live Testnet.
- Semua perubahan harus atomic, fail-closed, dan memiliki regression/integration test.

## Review Focus

- Konversi public key: metadata issuer, payload registry, dan credential-bound key harus konsisten tanpa pernah memakai public key account NEAR sebagai issuer key.
- Restart persistence: key, schema/config, authorization root, dan schema hash tetap identik; file secret/state tetap `0600`.
- Registry authorization: unknown, inactive, key-version mismatch, schema mismatch, malformed result, timeout, dan RPC failure semuanya deny.
- Registration safety: owner-only, exact method/arguments, storage deposit/gas terlihat sebelum sign, final transaction dan read-back diverifikasi.
- Live evidence: semua klaim Testnet harus menyertakan block/transaction/read-back yang dapat diverifikasi; fixture/mock diberi label jelas.

---

### Task 1: Read-only Testnet preflight and repository baseline

**Files:**
- Read: `contracts/near/issuer-registry/src/lib.rs`
- Read: `packages/anoncreds-agent-demo/src/roles/issuer.mjs`
- Read: `packages/anoncreds-agent-demo/src/near-issuer-registry.mjs`
- Read: `docs/NEAR_TESTNET_DEPLOYMENT_2026-11-16.md`
- Create: `docs/evidence/near-testnet-preflight-2026-11-16.md`

**Interfaces:**
- Produces: redacted evidence containing contract owner, deployed code identity, current issuer read-back, RPC block context, and signer availability status (never secret values).

- [ ] Run `git status`, capture HEAD and PR metadata, and verify the working tree is clean before implementation.
- [ ] Query `get_owner`, `get_issuer({"issuer_id":"wkams.testnet"})`, and contract/account state through finality Testnet RPC.
- [ ] Inspect signer tooling/configuration without printing credentials; if no authorized signer is available, record the exact secure authorization action required and stop chain mutation.
- [ ] Write redacted preflight evidence and distinguish implemented/local/mock/live status.
- [ ] Verify the preflight document contains no secret material.

### Task 2: Canonical issuer registry identity in the live issuer service

**Files:**
- Modify: `packages/anoncreds-agent-demo/src/roles/issuer.mjs`
- Modify: `packages/anoncreds-agent-demo/src/issuer-state-store.mjs` only if state schema needs explicit canonical registry identity
- Modify: `packages/anoncreds-agent-demo/src/near-key-format.mjs` only if conversion needs a focused helper
- Test: `packages/anoncreds-agent-demo/test/process-integration.test.mjs`
- Test: `packages/anoncreds-agent-demo/test/issuer-state-store.test.mjs`

**Interfaces:**
- Consumes: persisted issuer JWK and existing state file.
- Produces: `/public.issuerRegistryPublicKey` in canonical `ed25519:<Base58>`, while internal crypto continues using the raw Node/JWK-derived key as required by AnonCreds/capability code; `issuerAccountId`, positive `issuerKeyVersion`, and `schemaHash` remain explicit.

- [ ] Add a failing test proving `/public` exposes canonical NEAR key format and that restart keeps key, state config, authorization root, and schema hash unchanged.
- [ ] Run focused tests and confirm failure before implementation.
- [ ] Implement one-way conversion from persisted Ed25519 public bytes to canonical NEAR Base58 for registry metadata and preserve the internal representation required by existing proof code.
- [ ] Ensure production/`NEAR_REQUIRED=true` rejects missing key/state and never auto-generates identity; retain development-only creation behavior.
- [ ] Run focused tests and verify pass, including permissions and malformed-state cases.

### Task 3: Safe owner registration command and live read-back verifier

**Files:**
- Create: `packages/anoncreds-agent-demo/src/register-issuer-testnet.mjs`
- Create: `packages/anoncreds-agent-demo/test/register-issuer-testnet.test.mjs`
- Modify: `packages/anoncreds-agent-demo/package.json`
- Modify: `docs/NEAR_TESTNET_DEPLOYMENT_2026-11-16.md`
- Create: `docs/runbooks/near-testnet-issuer-registration.md`

**Interfaces:**
- Consumes: issuer `/public` JSON, explicit environment configuration, and an approved secure NEAR signer integration.
- Produces: inspected payload for `register_issuer(issuer_id, public_key, key_version, schema_hash)`, final transaction outcome, and `get_issuer` read-back with every field compared.

- [ ] Add tests for exact argument schema, canonical key conversion, issuer/account separation, Testnet-only endpoint validation, no private material in output, and fail-closed behavior when signer is unavailable.
- [ ] Implement read-only payload generation first; output only redacted/public metadata.
- [ ] Implement mutation through an existing secure signer integration if available; never accept a seed/private key through CLI arguments or chat.
- [ ] Require explicit operator approval at the transaction boundary with account, method, public payload, gas/storage estimate, and Testnet network shown.
- [ ] Wait for final transaction outcome and verify `get_issuer` at finality; abort/report if read-back differs.
- [ ] If signer is unavailable, leave the transaction unsubmitted and document the exact secure action needed.

### Task 4: Real Testnet verifier acceptance harness

**Files:**
- Create: `packages/anoncreds-agent-demo/test/live-testnet-integration.test.mjs`
- Modify: `packages/anoncreds-agent-demo/src/roles/verifier.mjs` only for explicit startup pin validation if required
- Modify: `docs/NEAR_JUDGE_GUIDE.md`
- Create: `docs/evidence/live-testnet-issuer-verifier-2026-11-16.md`

**Interfaces:**
- Consumes: running issuer/holder/verifier processes and live Testnet registry values.
- Produces: redacted positive and negative HTTP evidence, registry read-back, transaction link, and finality/block context.

- [ ] Add a live-only harness that refuses `NEAR_NETWORK=local`, mock URLs, missing explicit pins, or missing persisted key/state paths.
- [ ] Run positive issuer → holder → verifier proof flow with hidden attributes and `NEAR_REQUIRED=true` against `https://rpc.testnet.near.org`.
- [ ] Run negative cases: unknown/inactive issuer, public-key mismatch, key-version mismatch, schema mismatch, RPC failure/timeout, invalid/expired/replayed/unauthorized proof.
- [ ] Verify denied requests do not consume challenge/quota state where the existing contract requires that invariant.
- [ ] Capture redacted evidence; never include private key, token, credential secret, or personal data.

### Task 5: Restart persistence and CI/documentation evidence

**Files:**
- Modify: `.github/workflows/anonymesh-anoncreds-integration.yml`
- Modify: `.github/workflows/anonymesh-anoncreds.yml`
- Modify: `docs/PROJECT_STATUS.md`
- Modify: `docs/ANONYMESH_FINAL_INTEGRATION_REPORT.md`
- Modify: `docs/NEAR_TESTNET_DEPLOYMENT_2026-11-16.md`

**Interfaces:**
- Consumes: completed implementation and evidence from Tasks 2–4.
- Produces: reproducible local/CI checks and an accurate status matrix separating implemented, local-tested, mock-tested, live-Testnet-verified, and blocked.

- [ ] Add a non-secret CI path for persistence/restart and live harness preflight; live mutation remains operator-controlled and never receives production secrets in CI.
- [ ] Stop/restart issuer and verifier with the same paths; assert public key, schema/config, authorization root, and verifier acceptance remain stable without re-registration.
- [ ] Run all relevant local tests, contract tests, and build checks; collect GitHub Actions links after push.
- [ ] Update operational runbook/environment variable list without real values.
- [ ] Review changed files for secrets and keep PR #1 open/Draft.
- [ ] Commit logical slices using Conventional Commits; do not merge.

---

## Verification Matrix

- [ ] `node --test` in `packages/anoncreds-agent-demo` passes.
- [ ] `cargo test --locked` and release WASM build pass in `contracts/near/issuer-registry`.
- [ ] Restart test proves stable identity/state and valid proof acceptance.
- [ ] Live Testnet `get_owner` and `get_issuer` read-back are captured.
- [ ] Registration transaction hash and explorer link exist only if a secure signer actually submitted it.
- [ ] Negative authorization tests fail closed.
- [ ] `git diff` and staged diff contain no secret/private material.
- [ ] PR #1 remains open and Draft; no merge performed.
