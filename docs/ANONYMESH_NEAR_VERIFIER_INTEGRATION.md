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

## Test commands and actual results

From `packages/anoncreds-agent-demo`:

- `node --test test/near-key-format.test.mjs test/near-issuer-registry.test.mjs`: **7 passed, 0 failed**.
- `node --test test/issuer-key-store.test.mjs`: **2 passed, 0 failed**.
- `node --test test/paai-verifier.test.mjs`: **11 passed, 0 failed**.
- `node --test test/process-integration.test.mjs`: **1 passed, 0 failed**; registry required, local RPC mock, persisted issuer key, restart/replay/concurrency checks.
- `npm test`: **81 passed, 0 failed, 0 skipped**.

Rust/Cargo and Android Gradle/ADB were unavailable in this sandbox. On the audited SHA `428f1c6a65902b1c92abfe5a3c7e80d9a6750a59`, GitHub Actions passed: AnonCreds [43736039368](https://github.com/wadezigh96/anonymesh/actions/runs/43736039368), process integration [43736039006](https://github.com/wadezigh96/anonymesh/actions/runs/43736039006), Linux ARM64 [43736039070](https://github.com/wadezigh96/anonymesh/actions/runs/43736039070), Android [43736039084](https://github.com/wadezigh96/anonymesh/actions/runs/43736039084), agent-auth [43737487949](https://github.com/wadezigh96/anonymesh/actions/runs/43737487949), and NEAR contract/WASM [43737492296](https://github.com/wadezigh96/anonymesh/actions/runs/43737492296). These are CI/build results, not live-chain or physical-device protocol evidence.

## Security limitations and remaining blockers

The registry is a public metadata trust anchor, not an on-chain proof verifier. Governance remains owner-controlled in the contract. TLS, distributed rate limiting/replay storage, production key custody, production transport identity, revocation witnesses, unlinkability analysis, and production tool-policy enforcement remain incomplete. Android remains a single-process proof demonstration and has no registry-backed wallet integration in this change.

No testnet or mainnet contract was deployed. No chain transaction or mutation was sent. No pull request or merge was created. Deployment readiness is **NOT READY** until the pinned Rust/NEAR and Android checks are rerun on the final commit, the contract/client compatibility is reviewed in the target environment, and an explicit testnet preflight is approved separately.

**Audited final SHA:** `428f1c6a65902b1c92abfe5a3c7e80d9a6750a59`.
