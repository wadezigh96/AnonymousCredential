# ANONYMESH NEAR Issuer Registry Verifier Integration Implementation Plan

> **For agentic workers:** Execute task-by-task; check off each verified step.

**Goal:** Make the Node verifier's real authorization path depend on a strictly validated, read-only NEAR issuer-registry record while preserving existing proof, replay, and capability checks.

**Architecture:** Add a narrow dependency-injected NEAR JSON-RPC view client and a strict Ed25519 format adapter. The verifier will load a registry record for the configured issuer, validate active/key/schema/version/status freshness, and only then run the existing AnonCreds and capability authorization path. Development mode may use deterministic mocked registry data in tests; it must not silently fall back to local trust in registry-backed mode.

**Tech Stack:** Node.js 22 ESM, `node:test`, built-in `fetch`, Node `crypto`, strict Base58 implementation or existing repository primitive, SQLite challenge/quota state, Rust NEAR SDK 5.30.1 contract.

**Spec:** `/home/ubuntu/upload/pasted_content.txt`

## Global Constraints

- Work only on `feat/anonymesh-private-agent-identity`; never modify or merge `main`.
- Never deploy or mutate a NEAR contract, send a blockchain transaction, or use a real production contract/account.
- Never request, generate, log, or commit private keys, tokens, seed phrases, or production secrets.
- Registry-dependent authorization fails closed on unavailable, malformed, unknown, inactive, mismatched, or stale data.
- Preserve existing AnonCreds proof verification, atomic nonce replay prevention, and capability quota semantics.
- Do not claim revocation/non-revocation support from the opaque status root.
- Keep dependencies unchanged unless an existing pinned dependency is insufficient and the change is justified by tests.

## Review Focus

- `ed25519:` Base58 strings must decode to exactly 32 bytes and re-encode canonically; test invalid prefix, alphabet, length, and key type.
- RPC responses must be bounded, timeout-limited, shape-validated, and unable to substitute a local key when registry mode is enabled.
- Registry identity must include network, contract account, issuer account, and key version so records cannot cross-contaminate.
- Status epoch rollback, inactive transitions, key rotation, and cache expiry must deny authorization rather than authorize stale state.
- Private issuer key material must never appear in public configuration, errors, logs, or test output.

---

### Task 1: Canonical NEAR key format adapter

**Files:**
- Create: `packages/anoncreds-agent-demo/src/near-key-format.mjs`
- Test: `packages/anoncreds-agent-demo/test/near-key-format.test.mjs`

**Interfaces:**
- Produces `encodeNearEd25519PublicKey(raw32: Uint8Array|Buffer): string`.
- Produces `decodeNearEd25519PublicKey(value: string): Buffer`.
- Produces `nodeEd25519PublicKeyToNear(value: string): string` and `nearEd25519PublicKeyToNode(value: string): string`, where Node form is canonical base64url JWK `x`.

- [ ] Add deterministic vectors including the contract's `ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp` value and round-trip raw bytes.
- [ ] Add negative tests for missing/incorrect prefix, invalid Base58 characters, wrong decoded length, non-canonical encodings, and unsupported key type.
- [ ] Implement strict Base58 encode/decode with exact canonical re-encoding and 32-byte validation; do not accept private-key inputs.
- [ ] Run `node --test test/near-key-format.test.mjs` and record counts.

### Task 2: Read-only NEAR registry client

**Files:**
- Create: `packages/anoncreds-agent-demo/src/near-issuer-registry.mjs`
- Test: `packages/anoncreds-agent-demo/test/near-issuer-registry.test.mjs`

**Interfaces:**
- `createNearIssuerRegistryClient({ network, contractAccount, rpcUrl, issuerAccount, expectedKeyVersion, cacheTtlMs, maxStaleMs, fetchImpl, now, timeoutMs, maxResponseBytes })`.
- `client.getIssuerRecord({ forceRefresh = false }) -> Promise<IssuerRegistryRecord>`.
- `IssuerRegistryUnavailableError` with stable public error codes only.

- [ ] Define supported network/RPC URL and NEAR account validation without hardcoding a real contract.
- [ ] Implement only JSON-RPC `query`/view-call behavior for `get_issuer`; expose no signer, transaction, or mutation API.
- [ ] Bound timeout and response size; parse only the expected `{result:{result:...}}` shape and reject malformed JSON/bytes/base64/record payloads.
- [ ] Validate issuer account, exact contract account, canonical NEAR public key, positive key version, 64-character lowercase schema/status hashes, active boolean, nonnegative status epoch, and configured expected key version.
- [ ] Implement a bounded per-client cache keyed by network/contract/issuer/key version with explicit TTL and maximum stale age; do not return stale data when status is unknown or beyond max stale age.
- [ ] Add deterministic mocked-fetch tests for valid record, unknown/inactive issuer, invalid accounts, malformed RPC, timeout/network error, oversized response, invalid key/hash/version, cache expiry, epoch rollback, and cache isolation.
- [ ] Run the focused client tests.

### Task 3: Stable issuer key lifecycle

**Files:**
- Create/modify: `packages/anoncreds-agent-demo/src/issuer-key-store.mjs`, issuer role/configuration files as required.
- Test: `packages/anoncreds-agent-demo/test/issuer-key-store.test.mjs`.

**Interfaces:**
- `loadIssuerKey({ file, expectedKeyVersion, mode }) -> { privateKey, publicKey, keyVersion }`.
- `generateIssuerKeyFile({ file, keyVersion = 1 })` as an explicit development-only utility.

- [ ] Define a canonical non-secret private-key file encoding using an already supported Node key representation, with `0600` enforcement and fail-closed insecure-permission behavior in production-like mode.
- [ ] Reject missing, malformed, wrong-type, unreadable, and version-mismatched files without returning key bytes in errors/logs.
- [ ] Make creation atomic under concurrent startup and make rotation explicit; never overwrite an existing key implicitly.
- [ ] Add tests for restart stability, signature/public-key match, malformed/missing/insecure file, explicit rotation/version mismatch, concurrent creation, and no secret in serialized public config/errors/log capture.
- [ ] Keep the current generated demo key behavior only behind explicit test/development configuration if the HTTP integration requires it.
- [ ] Run focused lifecycle tests and the affected existing suites.

### Task 4: Registry-backed verifier authorization gate

**Files:**
- Modify: `packages/anoncreds-agent-demo/src/paai-verifier.mjs`
- Modify: `packages/anoncreds-agent-demo/src/roles/verifier.mjs`
- Test: `packages/anoncreds-agent-demo/test/paai-verifier.test.mjs`
- Test: `packages/anoncreds-agent-demo/test/process-integration.test.mjs`

**Interfaces:**
- Extend `verifyAndAuthorizeAgentRequest({ issuerRegistry, expectedIssuerAccount, expectedIssuerKeyVersion, expectedSchemaHash, expectedStatusEpoch, ...existing })`.
- In registry-backed mode, resolve the record before consuming the challenge and require: record exists/active, canonical public key matches the issuer identity used by the credential, key version equals the proof/configured version, schema hash matches, and status epoch satisfies the configured freshness/monotonicity rule.

- [ ] Add failing tests for registry unavailable, unknown, inactive, key mismatch, key-version mismatch, schema mismatch, missing metadata, stale/rolled-back epoch, and valid record.
- [ ] Ensure every failure leaves challenge and capability quota unconsumed.
- [ ] Wire verifier configuration from explicit environment variables: `NEAR_NETWORK`, `NEAR_REGISTRY_CONTRACT`, `NEAR_RPC_URL`, `NEAR_ISSUER_ACCOUNT_ID`, `NEAR_EXPECTED_KEY_VERSION`, `NEAR_EXPECTED_SCHEMA_HASH`, `NEAR_EXPECTED_STATUS_EPOCH`, `NEAR_CACHE_TTL_MS`, `NEAR_MAX_STALE_AGE_MS`, and `NEAR_REQUIRED`.
- [ ] Make `NEAR_REQUIRED=true` fail closed at startup/authorization when incomplete; no local fallback is allowed. Keep an explicitly named development/test bypass only where tests inject a registry client.
- [ ] Preserve the existing atomic SQLite flow by performing registry reads before the ledger transaction and preventing registry failures from consuming state.
- [ ] Add process tests with a mocked registry boundary or deterministic local HTTP RPC fixture; do not call live NEAR or mutate chain state.
- [ ] Run focused verifier and process integration tests.

### Task 5: Contract/client compatibility and documentation

**Files:**
- Modify: `contracts/near/issuer-registry/README.md` only if the actual view schema/format needs clarification.
- Modify: `docs/ANONYMESH_DEPLOYMENT_READINESS.md`.
- Modify: `docs/SECURITY_LIMITATIONS.md`.
- Modify: `docs/ANONYMESH_ARCHITECTURE.md`.
- Modify: `docs/TESTNET_DEMO.md`.
- Create: `docs/ANONYMESH_NEAR_VERIFIER_INTEGRATION.md`.

- [ ] Document the exact registry view method, JSON-RPC request/response shape, canonical key format, environment variables, fail-closed matrix, cache rules, status-root limitation, and no-deployment boundary.
- [ ] Update status tables to distinguish registry-backed verifier enforcement from Android single-process demo behavior.
- [ ] Include exact final SHA and only fresh test/workflow evidence; do not preserve stale “not wired” statements after wiring is verified.
- [ ] Explicitly list remaining blockers: Rust toolchain/CI evidence if unavailable, no live deployment, governance, revocation/non-revocation, transport, Android boundary, and external security review.

### Task 6: Full verification and safe commits

**Files:**
- All implementation/test/docs files above.

- [ ] Run Node focused tests, full `npm test`, process integration, HTTP abuse-protection, and benchmark commands.
- [ ] Install or otherwise use a pinned Rust 1.95 toolchain only if available without secrets or repository mutation; run agent-auth tests, contract tests, and WASM release build. If unavailable, report exact blocker.
- [ ] Run available Android checks/build or report exact environmental blocker; do not infer physical-device success.
- [ ] Inspect final diff for unrelated changes and scan staged names/content for secrets/private keys/tokens.
- [ ] Fetch branch HEAD again, confirm only target branch changed, record final SHA, and create atomic commits for implementation/tests/docs. Do not push, merge, or open a pull request.
- [ ] Update the final integration document with exact command outcomes, pass/fail/skipped counts, workflow links only where independently verified, and deployment readiness exactly as `NOT READY`, `READY FOR TESTNET PREFLIGHT ONLY`, or `READY FOR EXPLICIT TESTNET DEPLOYMENT APPROVAL`.
