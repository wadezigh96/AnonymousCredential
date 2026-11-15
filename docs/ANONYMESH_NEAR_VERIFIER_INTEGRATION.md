# ANONYMESH NEAR Issuer Registry Verifier Integration

**Status:** implemented and locally verified on `feat/anonymesh-private-agent-identity`; not deployed.

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

The client enforces a timeout and response-size limit, validates account IDs and all fields, and supports a bounded per-client cache. `NEAR_CACHE_TTL_MS` controls fresh-cache use; `NEAR_MAX_STALE_AGE_MS` is an explicit upper bound and is never used for inactive or unknown records. A conservative `0` TTL is recommended where immediate status changes matter.

## Environment variables

| Variable | Meaning |
|---|---|
| `NEAR_REQUIRED` | Set `true` to make registry trust mandatory on every authorization. |
| `NEAR_NETWORK` | `local`, `testnet`, or `mainnet`; `local` is intended for deterministic fixtures. |
| `NEAR_REGISTRY_CONTRACT` | Explicit registry contract account; never hardcoded by the client. |
| `NEAR_RPC_URL` | Read-only JSON-RPC endpoint. |
| `NEAR_ISSUER_ACCOUNT_ID` | Issuer account queried from the registry. |
| `NEAR_EXPECTED_KEY_VERSION` | Required positive key version. |
| `NEAR_EXPECTED_SCHEMA_HASH` | Required lowercase 64-character schema hash. |
| `NEAR_EXPECTED_STATUS_EPOCH` | Optional minimum accepted status epoch. |
| `NEAR_CACHE_TTL_MS` | Fresh cache TTL; default `0`. |
| `NEAR_MAX_STALE_AGE_MS` | Maximum bounded stale age; default `0`. |
| `NEAR_RPC_TIMEOUT_MS` | RPC timeout; default `5000`. |
| `ISSUER_KEY_FILE` | Versioned owner-only issuer private-key file. |

## Fail-closed matrix

| Condition | Decision |
|---|---|
| Missing/incomplete registry configuration in required mode | Deny / startup configuration error |
| RPC timeout, HTTP error, network error, malformed JSON or oversized response | Deny |
| Unknown issuer or incomplete record | Deny |
| Invalid account, key prefix, Base58, key length, hash, version, or status epoch | Deny |
| Inactive issuer | Deny |
| Credential-bound issuer key mismatch | Deny |
| Key-version or schema-hash mismatch | Deny |
| Status epoch below configured minimum or cache beyond maximum stale age | Deny |
| Valid active record plus valid existing proof/capability checks | Continue to authorization |

The registry `status_root` remains an opaque commitment. This integration does not verify revocation or non-revocation witnesses and makes no revocation-complete claim.

## Test and CI evidence

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

No testnet or mainnet contract was deployed. No chain transaction or mutation was sent. No pull request or merge was created. Deployment readiness remains **TESTNET NOT READY**. CI success does not establish production readiness or live-chain correctness; contract/client compatibility review and a separately approved testnet preflight remain outstanding.

**Audited final SHA:** `8857ba2e91a781efe3792ef17230b4ee4ad6c31c` ([canonical commit](https://github.com/wadezigh96/anonymesh/commit/8857ba2e91a781efe3792ef17230b4ee4ad6c31c)).
