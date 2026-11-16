# ANONYMESH — NEAR Judge Guide

**Purpose:** a reproducible explanation of the NEAR integration and its exact maturity.
**Network status:** NEAR Testnet registry deployed and initialized at `registry.wkams.testnet` (owner `wkams.testnet`). Deployment transaction: [DrFYWN8Kx25f3265ydvJNyfUpiPT9GpjMiQJJMBJXJYHD](https://explorer.testnet.near.org/transactions/DrFYWN8Kx25f3265ydvJNyfUpiPT9GpjMiQJJMBJXJYHD). Owner read-back succeeded. Issuer registration and live verifier acceptance are still pending.
**Canonical project status:** [PROJECT_STATUS.md](PROJECT_STATUS.md).
**Operator preflight (2026-11-16):** `wkams.testnet` was read successfully with 18.9 NEAR, one Full Access key and no contract code. The Termux Rust CLI works, but its local legacy credentials file is empty and a supported Meteor Wallet signer has not yet been connected. Account balance and on-chain key presence do not mean this device can sign.
**Privacy boundary:** the registry is a public metadata anchor. It is not a private chain, private storage, an AnonCreds verifier, or a payment rail.

## 1. What works today

The contract deployment is complete. The live owner view returned `wkams.testnet`; `get_issuer({"issuer_id":"wkams.testnet"})` returned `null` because no issuer record has been registered. Deployment artifact source SHA: `c8c2529d76a04be1bf8ab2ea33662ef661d463b2`; WASM SHA-256: `10a80c1d86687259fd76f1c3a6f28789069d3a37dac88fc590539735db8f43e9`. Full transaction and checks are recorded in [NEAR_TESTNET_DEPLOYMENT_2026-11-16.md](NEAR_TESTNET_DEPLOYMENT_2026-11-16.md).



| Layer | Implemented behavior | Evidence boundary |
|---|---|---|
| NEAR contract | Owner-controlled issuer registration, active/inactive status, Ed25519 key validation, monotonic key version and status epoch, schema/status hash validation, storage-deposit accounting/refund | Deployed at `registry.wkams.testnet`; `get_owner()` verified. No issuer registered yet; see deployment record. |
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

## 4. CI evidence that can be independently checked

The following GitHub Actions runs completed successfully. The relevant source files in the current readiness branch were checked against the tested commit and have identical Git blob SHAs:

- **NEAR Rust unit tests + WASM build:** [run 43805451359](https://github.com/wadezigh96/anonymesh/actions/runs/43805451359), commit `a5754245fd017eb00440f8799bd793eed64b648d`. All job steps succeeded, including `cargo test --locked`, release WASM build, checksum generation and artifact upload. The contract source blob at that tested commit is identical to the current readiness branch (`d300c984479718ffe970ad776944f9f6096fa4b1`).
- **AnonCreds integration:** [run 43806163768](https://github.com/wadezigh96/anonymesh/actions/runs/43806163768), commit `c0ce2f921299054d564a4d7fa9b397ada198cb25`, success.
- **Separate-process integration (including required registry mode):** [run 43806163795](https://github.com/wadezigh96/anonymesh/actions/runs/43806163795), same commit, success. The process integration test file and NEAR adapter test file in the current readiness branch have identical blob SHAs to that tested commit.
- **Linux ARM64 benchmark:** [run 43806163774](https://github.com/wadezigh96/anonymesh/actions/runs/43806163774), same commit, success.

The NEAR workflow uploaded artifact `anonymesh-issuer-registry-wasm-a5754245fd017eb00440f8799bd793eed64b648d` (artifact ID `14198086567`). Its SHA-256 digest reported by GitHub for the artifact archive is `9a58bd9aeccc0ccdec264d18a9e079a90ad79dd60827e90b4e75e05994c20cbf`. This is the archive digest, not the WASM file checksum.

These are source/build/test CI results, not evidence that the WASM was deployed or that a live Testnet contract was queried. The latest commits after these runs are documentation-only; the CI results above are not being represented as a fresh run on the documentation HEAD.

## 5. Live Testnet acceptance evidence still required


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

## 6. Security and product limitations

- NEAR Testnet is public. Never put private identity attributes, link secrets, credential contents, proof witnesses, personal identifiers or per-presentation events on-chain.
- The registry is a trust anchor for public issuer metadata, not a private identity database and not an on-chain ZK/AnonCreds verifier.
- `status_root` is an opaque, monotonically versioned commitment. The current implementation does not prove revocation or non-revocation.
- The local mock proves adapter/verifier integration, not live RPC availability, deployed contract correctness or validator consensus.
- The demo is loopback/local prototype code. It does not execute external tools or payments.
- Full unlinkability, distributed replay protection, production key custody, independent cryptographic review and production deployment are not demonstrated.
- This NEAR Testnet prototype is not the user's intended final permissioned/private network architecture.

## 7. Accurate judge-facing summary

> ANONYMESH demonstrates a local Issuer–Holder–Verifier flow using AnonCreds selective disclosure and a separate authorization gate. Its NEAR component is a Rust issuer/status registry plus a strict read-only RPC adapter. In required mode, the verifier checks the registry record before authorizing and fails closed when the record is invalid or unavailable. The repository includes a deterministic mock-RPC integration test and contract unit tests. The contract is deployed to NEAR Testnet at `registry.wkams.testnet` (owner `wkams.testnet`); the deployment transaction and successful `get_owner()` read-back are recorded in [the deployment record](NEAR_TESTNET_DEPLOYMENT_2026-11-16.md). No issuer record has been registered yet, and live verifier acceptance is not claimed. Private claims and holder secrets remain off-chain.
