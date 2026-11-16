# ANONYMESH — NEAR Judge Guide

**Purpose:** a reproducible explanation of the NEAR integration and its exact maturity.
**Network status:** source + local/mock-RPC integration only. No live NEAR Testnet deployment or on-chain transaction is claimed.
**Privacy boundary:** the registry is a public metadata anchor. It is not a private chain, private storage, an AnonCreds verifier, or a payment rail.

## 1. What works today

| Layer | Implemented behavior | Evidence boundary |
|---|---|---|
| NEAR contract | Owner-controlled issuer registration, active/inactive status, Ed25519 key validation, monotonic key version and status epoch, schema/status hash validation, storage-deposit accounting/refund | Rust contract source and unit tests; deployment not evidenced |
| RPC adapter | Read-only `query/call_function` to `get_issuer`, bounded response, timeout, strict JSON/field/key/hash validation, optional expected version/schema/epoch checks | Node unit tests and deterministic local JSON-RPC mock |
| Verifier gate | With `NEAR_REQUIRED=true`, verifier reads issuer record before authorization; registry failure returns deny; cache TTL and stale fallback are disabled | Separate-process integration test against deterministic mock |
| Private proof flow | AnonCreds presentation, key binding, Ed25519 PoP, capability scope, challenge and replay/quota checks | Local three-process prototype; no production external action |

## 2. Request path: how NEAR is connected

1. The issuer process publishes public configuration to the local demo.
2. Verifier starts with `NEAR_REQUIRED=true` and constructs `createNearIssuerRegistryClient`.
3. During `POST /verify`, the verifier retrieves the challenge from its own ledger.
4. Before calling `verifyAndAuthorizeAgentRequest`, it awaits `registryClient.getIssuerRecord()`.
5. The adapter sends a NEAR JSON-RPC `query` with `request_type=call_function`, `finality=final`, method `get_issuer`, and base64 JSON args `{"issuer_id":"..."}`.
6. The contract view method returns the issuer record. The adapter validates public key format, key version, schema hash, active flag, status epoch and status root, and compares configured expectations.
7. Any unavailable, malformed, unknown, inactive, or mismatched registry record causes the verifier endpoint to reject the request. With registry-required mode, stale cache fallback is disabled.

The contract stores only public issuer metadata. It does not receive or inspect the holder's AnonCreds presentation, link secret, proof witness, or private claims.

## 3. Reproduce the verified local integration

From repository root:

```sh
npm install --prefix packages/anoncreds-agent-demo --no-audit --no-fund
npm test --prefix packages/anoncreds-agent-demo
```

The registry-backed integration test configures `NEAR_REQUIRED=true`, a persisted issuer key and a deterministic local JSON-RPC mock. It tests the verifier/registry boundary without pretending that the mock is a live NEAR network.

For contract source checks:

```sh
cargo test --manifest-path contracts/near/issuer-registry/Cargo.toml --locked
rustup target add wasm32-unknown-unknown
cargo build --manifest-path contracts/near/issuer-registry/Cargo.toml --locked --target wasm32-unknown-unknown --release
```

A successful local test or WASM build is not proof of deployment. A deployed contract requires a real testnet account, contract account, transaction receipt and explorer-verifiable state.

## 4. Live Testnet acceptance evidence still required

Do not mark any item complete until the evidence exists:

- [ ] Testnet contract account ID and deployed WASM checksum/source commit.
- [ ] Explorer transaction for deployment and initialization.
- [ ] Explorer transaction for issuer registration with attached storage deposit.
- [ ] View call to `get_issuer` returning the expected record from the live testnet RPC.
- [ ] Verifier configured with that contract/account and real RPC; valid proof accepted.
- [ ] Inactive/unknown issuer and key/schema mismatch rejected against the live registry.
- [ ] RPC unavailable or malformed record rejected (fail closed).
- [ ] Demo recording shows the above without exposing secrets or private credential claims.

Deployment and registry writes are external blockchain transactions. They are intentionally not performed by this documentation/audit change; they require the owner's explicit approval and a reviewed transaction payload.

## 5. Security and product limitations

- NEAR Testnet is public. Never put private identity attributes, link secrets, credential contents, proof witnesses, personal identifiers or per-presentation events on-chain.
- The registry is a trust anchor for public issuer metadata, not a private identity database and not an on-chain ZK/AnonCreds verifier.
- `status_root` is an opaque, monotonically versioned commitment. The current implementation does not prove revocation or non-revocation.
- The local mock proves adapter/verifier integration, not live RPC availability, deployed contract correctness or validator consensus.
- The demo is loopback/local prototype code. It does not execute external tools or payments.
- Full unlinkability, distributed replay protection, production key custody, independent cryptographic review and production deployment are not demonstrated.
- This NEAR Testnet prototype is not the user's intended final permissioned/private network architecture.

## 6. Accurate judge-facing summary

> ANONYMESH demonstrates a local Issuer–Holder–Verifier flow using AnonCreds selective disclosure and a separate authorization gate. Its NEAR component is a Rust issuer/status registry plus a strict read-only RPC adapter. In required mode, the verifier checks the registry record before authorizing and fails closed when the record is invalid or unavailable. The repository includes a deterministic mock-RPC integration test and contract unit tests. The contract has not yet been deployed to NEAR Testnet; live-chain transaction and state evidence is therefore not claimed. Private claims and holder secrets remain off-chain.
