> **Status update (2026-11-16):** This integration report's pre-deployment status is historical. The registry has since been deployed at `registry.wkams.testnet` and owner read-back verified. Issuer registration and live verifier acceptance remain pending. See [deployment record](NEAR_TESTNET_DEPLOYMENT_2026-11-16.md).

# ANONYMESH NEAR Issuer Registry Verifier Integration

**Status:** implementation merged into the current default branch `main` through PR #2. The NEAR registry is deployed at `registry.wkams.testnet` and its owner view has been verified. This document's detailed test table remains a historical snapshot; see [PROJECT_STATUS.md](PROJECT_STATUS.md) for current CI evidence. Issuer registration and live verifier acceptance remain pending.

## Architecture and data flow

The issuer publishes its persisted Ed25519 registry public key, key version, issuer NEAR account identifier, and a SHA-256 schema hash in its public configuration. That public key is also included as the `issuer_registry_key` attribute in the AnonCreds credential and is revealed in the verifier's trusted presentation request. The credential signature therefore binds the disclosed registry key to the issuer's AnonCreds credential.

When `NEAR_REQUIRED=true`, the verifier creates a read-only JSON-RPC client. Before authorization, it calls the configured registry contract's `get_issuer` view for the configured issuer account. The client validates the response, canonical `ed25519:` key, key version, schema hash, active flag, status epoch, and opaque status root. The verifier compares the credential-bound issuer key and configured version/schema expectations to the validated registry record, then continues with the existing AnonCreds proof, capability-chain, proof-of-possession, nonce replay, and quota checks. A registry failure returns a denial and leaves challenge/quota state untouched.

The process integration test uses a local deterministic HTTP JSON-RPC mock. It does not contact NEAR, deploy a contract, invoke a mutation, or send a transaction.

## Canonical key format

The contract format is `ed25519:<Base58>`, using the NEAR alphabet and exactly 32 decoded bytes. Node uses the canonical Ed25519 JWK `x` value: 32 raw public-key bytes encoded as unpadded base64url. Conversion is strict and round-trip tested, including the contract vector `ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp`.

## Issuer key lifecycle

`ISSUER_KEY_FILE` contains a versioned JSON JWK private key and must be owner-only (`0600`). `loadIssuerKey` rejects missing, malformed, wrong-type, version-mismatched, and insecure files in strict mode. `generateIssuerKeyFile` is an explicit development utility and writes atomically without overwriting an existing target. The issuer's public key is derived from the loaded private key; it is never accepted independently. If no key file is configured, the role retains the pre-existing ephemeral development behavior; registry-backed deployments must configure a persisted key file.

## Registry RPC interface

The client sends a finality `query` request to the configured `NEAR_RPC_URL` with `request_type: call_function`, the configured `NEAR_REGISTRY_CONTRACT`, method `get_issuer`, and base64-encoded `{ "issuer_id": "..." }` arguments. It expects `result.result` to be a byte array containing JSON with `public_key`, `key_version`, `schema_hash`, `active`, `status_epoch`, and `status_root`. The client has no transaction signer or mutation API.

The client enforces a timeout and response-size limit, validates account IDs and all fields, and supports a bounded per-client cache. In the follow-up working tree, response bytes are counted while reading the body stream; the body is cancelled on an over-limit declared `Content-Length`, and the reader is cancelled as soon as actual bytes exceed the configured limit. `Content-Length` is an early rejection hint, not the enforcement mechanism. `NEAR_CACHE_TTL_MS` controls fresh-cache use. Stale fallback is limited to network errors, timeouts, and HTTP 408/429/5xx, and only while the cached record remains within `NEAR_MAX_STALE_AGE_MS` measured at fallback time. Malformed responses, unknown/inactive issuers, and fresh key/schema/status mismatches are denied rather than hidden by stale data. A conservative `0` TTL is recommended where immediate status changes matter.

## Trust assumptions and configuration bootstrap

The verifier fetches the issuer's `/public` configuration once at startup. That response supplies the verifier schema and credential definition, trusted capability-root issuer, demo policy, and default issuer account/key-version/schema expectations. Environment values `NEAR_ISSUER_ACCOUNT_ID`, `NEAR_EXPECTED_KEY_VERSION`, and `NEAR_EXPECTED_SCHEMA_HASH` can override or pin those registry expectations, but are optional in the current role wiring. The registry-bound issuer key in the credential is compared with the registry record; this does not independently authenticate the `/public` schema, credential definition, capability root, or policy. Deployments must protect and trust the `/public` source and should externally pin expected values rather than assume registry mode establishes all verifier trust inputs.

The client asks the configured RPC endpoint for `finality: final`, but trusts that endpoint's JSON-RPC response; it does not verify a NEAR state proof or block header locally. For `testnet` and `mainnet`, the client restricts the URL to the canonical NEAR RPC hostname; `local` accepts an explicitly configured HTTP(S) endpoint for fixtures. This integration report documents the adapter's trust model and mocked-RPC tests; it does not independently validate the deployed contract's issuer record or live verifier acceptance. A production design requiring trust-minimized reads would need independent state-proof/light-client verification or an explicitly accepted RPC-provider trust model.

## Environment variables

| Variable | Meaning |
|---|---|
| `NEAR_REQUIRED` | Set `true` to make registry trust mandatory on every authorization. |
| `NEAR_NETWORK` | `local`, `testnet`, or `mainnet`; `local` is intended for deterministic fixtures. |
| `NEAR_REGISTRY_CONTRACT` | Explicit registry contract account; never hardcoded by the client. |
| `NEAR_RPC_URL` | Read-only JSON-RPC endpoint. |
| `NEAR_ISSUER_ACCOUNT_ID` | Optional issuer-account override/pin; otherwise sourced from `/public`. |
| `NEAR_EXPECTED_KEY_VERSION` | Optional positive key-version pin; otherwise uses `/public.issuerKeyVersion`, falling back to `1` if absent. |
| `NEAR_EXPECTED_SCHEMA_HASH` | Optional lowercase 64-character schema-hash pin; otherwise sourced from `/public`. |
| `NEAR_EXPECTED_STATUS_EPOCH` | Optional minimum accepted status epoch. |
| `NEAR_CACHE_TTL_MS` | Fresh cache TTL; default `0`. |
| `NEAR_MAX_STALE_AGE_MS` | Maximum bounded stale age; default `0`. |
| `NEAR_RPC_TIMEOUT_MS` | RPC timeout; default `5000`. |
| `ISSUER_KEY_FILE` | Versioned owner-only issuer private-key file. |

## Fail-closed matrix

| Condition | Decision |
|---|---|
| Missing/incomplete registry configuration in required mode | Deny / startup configuration error |
| No usable cache and RPC timeout/network failure or HTTP 408/429/5xx | Deny |
| Eligible transient availability failure and a cached record within the configured stale-age bound | Use the previously validated record; age is checked when fallback occurs |
| HTTP 4xx other than 408/429, malformed JSON/RPC/result, incomplete record, or oversized body | Deny; do not use stale cache |
| Unknown issuer or inactive issuer | Deny; do not use stale cache |
| Invalid account, key prefix, Base58, key length, hash, version, or status epoch | Deny |
| Credential-bound issuer key mismatch, key-version/schema-hash mismatch, or status epoch below configured minimum | Deny; do not use stale cache to mask the fresh record |
| Cache exceeds the configured maximum stale age | Deny |
| Valid active record plus valid existing proof/capability checks | Continue to authorization |

The registry `status_root` remains an opaque commitment. This integration does not verify revocation or non-revocation witnesses and makes no revocation-complete claim.

## Follow-up local verification

The follow-up changes add tests for fresh key-version/schema mismatches, stale-age expiry during a failing request, transient versus non-transient HTTP status handling, missing/understated `Content-Length`, early cancellation for an over-limit declared `Content-Length`, and a process-level HTTP 503 followed by a retry of the same challenge and proof. The full local `npm test` run from `packages/anoncreds-agent-demo` passed 86 tests (0 failed, 0 skipped, 0 todo) on 2026-11-16. The 81-test statement below is the historical audited-baseline result; the 86-test result is local evidence for these follow-up changes only, not CI evidence for them or live NEAR evidence.

## Test and CI evidence

The following 81-test statement is historical evidence for the audited baseline, not the later local follow-up working tree result recorded above.

**Node test result reported by the final verification execution: 81 passed, 0 failed, 0 skipped, 0 todo.** The command was `npm test`, run from `packages/anoncreds-agent-demo`. The original local terminal output was not available in this documentation-only reconciliation, and the local execution was not rerun here.

The inspected GitHub Actions log for [run 43737644575](https://github.com/wadezigh96/anonymesh/actions/runs/43737644575), job `anoncreds-native-demo`, step `Run issuer-holder-verifier and adversarial tests`, records the CI command `npm test --prefix packages/anoncreds-agent-demo` and reports `# tests 81`, `# pass 81`, `# fail 0`, `# skipped 0`, and `# todo 0`. This is separate GitHub-hosted CI evidence; the count is not inferred from run metadata alone.

The six verified GitHub Actions runs are:

| Workflow | Run |
|---|---|
| ANONYMESH AnonCreds integration | [43737644575](https://github.com/wadezigh96/anonymesh/actions/runs/43737644575) |
| ANONYMESH AnonCreds process integration | [43737647157](https://github.com/wadezigh96/anonymesh/actions/runs/43737647157) |
| ANONYMESH Linux ARM64 benchmark | [43737649929](https://github.com/wadezigh96/anonymesh/actions/runs/43737649929) |
| ANONYMESH Android native proof smoke test | [43737652777](https://github.com/wadezigh96/anonymesh/actions/runs/43737652777) |
| ANONYMESH agent authentication | [43737655482](https://github.com/wadezigh96/anonymesh/actions/runs/43737655482) |
| ANONYMESH NEAR contract | [43737658221](https://github.com/wadezigh96/anonymesh/actions/runs/43737658221) |

GitHub run metadata confirms all six completed successfully on branch `feat/anonymesh-private-agent-identity` at SHA `8857ba2e91a781efe3792ef17230b4ee4ad6c31c`, each with event `workflow_dispatch`. Rust/WASM and Android evidence is GitHub-hosted, not local Cargo/Gradle/ADB execution. These runs are CI/build evidence only; they do not establish testnet/mainnet deployment, live RPC or live-chain correctness, physical-device protocol behavior, or production readiness.

## Security limitations and remaining blockers

The registry is a public metadata trust anchor, not an on-chain proof verifier. Governance remains owner-controlled in the contract. TLS, distributed rate limiting/replay storage, production key custody, production transport identity, revocation witnesses, unlinkability analysis, and production tool-policy enforcement remain incomplete. Android remains a single-process proof demonstration and has no registry-backed wallet integration in this change.

**Historical scope note:** this audited integration snapshot did not itself deploy a contract, send a transaction, or create a pull request. Since that snapshot, the registry has been deployed to NEAR Testnet and PR #2 has been merged into `main`. The deployment does not establish issuer registration or live verifier acceptance; those remain pending. CI success does not establish production readiness or live-chain correctness.

**Audited final SHA:** `8857ba2e91a781efe3792ef17230b4ee4ad6c31c` ([canonical commit](https://github.com/wadezigh96/anonymesh/commit/8857ba2e91a781efe3792ef17230b4ee4ad6c31c)).
