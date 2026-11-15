# ANONYMESH NEAR Verifier Integration Audit

**Audit date:** 2026-11-15
**Repository:** `wadezigh96/anonymesh`
**Branch:** `feat/anonymesh-private-agent-identity`
**Audited HEAD:** `ddeec496656f149fc6f20ff237644ab565c3ade2`

## Scope and safety boundary

The audit and implementation are restricted to the feature branch. No `main` changes, pull request, merge, NEAR deployment, chain transaction, registry mutation, or production secret use is permitted.

## Current architecture

The Node package at `packages/anoncreds-agent-demo` runs issuer, holder, and verifier roles as separate HTTP processes. The verifier validates an AnonCreds presentation, checks the issuer-attested Ed25519 agent key, verifies a signed delegated-capability chain and proof of possession, and atomically consumes SQLite-backed challenge/quota state. The verifier currently obtains schema, credential-definition, and trusted capability-root configuration from the issuer's `/public` endpoint.

The Rust contract at `contracts/near/issuer-registry` stores public issuer metadata keyed by NEAR account ID: `ed25519:` public key, monotonically increasing key version, schema hash, active flag, status epoch, and opaque status root. Its owner-only mutation and monotonicity rules are covered by unit tests. The contract is not currently read by the Node verifier.

The Android app is explicitly a single-process native AnonCreds proof smoke test. It is not a separate-role wallet/verifier integration and must not be represented as one.

## Confirmed defects/gaps

1. The real verifier authorization path has no NEAR registry client or registry-backed trust decision.
2. A locally supplied issuer schema/credential-definition and issuer metadata can authorize the existing demo flow without checking a registry record.
3. Node and Rust/NEAR public-key representations are not connected by a tested strict conversion layer.
4. There is no explicit production-like fail-closed behavior for registry unavailable, unknown/inactive issuer, key mismatch, key-version mismatch, schema mismatch, stale status metadata, or malformed RPC responses.
5. Issuer identity/key persistence and explicit versioned rotation are not implemented for the issuer process; the demo generates fresh capability-root state on startup and remains a development fixture.
6. Documentation correctly says the registry is not wired into authorization, but several docs contain historical CI/readiness statements that must be updated to the final verified SHA and actual test outcomes.

## Test baseline

- Command: `npm install --no-audit --no-fund --package-lock=false --ignore-scripts=false && npm test` from `packages/anoncreds-agent-demo`
- Result: **PASS — 70 passed, 0 failed, 0 skipped**
- Duration: 58.675 seconds
- Command: `cargo test --manifest-path crates/agent-auth/Cargo.toml --locked` and `cargo test --manifest-path contracts/near/issuer-registry/Cargo.toml --locked`
- Result: **NOT EXECUTED — `cargo: command not found`**
- WASM build, Android build, and GitHub Actions were not used as baseline evidence in this sandbox audit.

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
