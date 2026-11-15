# ANONYMESH Testnet Demo Runbook

**Network boundary: NEAR testnet only.** No deployment or transaction is authorized by this repository audit. A separate explicit confirmation is required before any external transaction.

## Local proof demo

From the repository root:

```sh
npm install --prefix packages/anoncreds-agent-demo --no-audit --no-fund
npm test --prefix packages/anoncreds-agent-demo
npm run demo --prefix packages/anoncreds-agent-demo
npm run benchmark --prefix packages/anoncreds-agent-demo
```

The install script downloads the official Linux native AnonCreds release for the host. Do not copy an Android `.so` into a Linux runtime. The current local suite passes 80 Node tests, including the separate-process integration test with `NEAR_REQUIRED=true`, a persisted issuer key, and a deterministic local JSON-RPC registry mock. The standalone AnonCreds demo should show `valid: true`, `privateSubjectDisclosed: false`, and `nonceBoundToContext: true`. For a registry-backed run, configure `NEAR_NETWORK`, `NEAR_REGISTRY_CONTRACT`, `NEAR_RPC_URL`, `NEAR_ISSUER_ACCOUNT_ID`, `NEAR_EXPECTED_KEY_VERSION`, `NEAR_EXPECTED_SCHEMA_HASH`, and `NEAR_REQUIRED=true`; never use a fake record for deployment evidence.

## Rust and contract checks

```sh
cargo test --manifest-path crates/agent-auth/Cargo.toml --locked
cargo test --manifest-path contracts/near/issuer-registry/Cargo.toml --locked
rustup target add wasm32-unknown-unknown
cargo build --manifest-path contracts/near/issuer-registry/Cargo.toml --locked \
  --target wasm32-unknown-unknown --release
```

These commands validate source and build artifacts locally. They do not deploy the contract. In the current sandbox, `cargo` and `rustup` were unavailable, so no Rust or WASM result is claimed from this run.

## Transaction preflight requirement

Before proposing a deployment or registry update, record the exact:

- network (`testnet`, never `mainnet`);
- signer account and receiver account;
- contract method and JSON arguments;
- attached deposit and gas;
- estimated cost and disposable testnet funding source;
- expected state change and rollback/disable plan.

Show that payload to the owner and wait for explicit confirmation. Never paste private keys into the repository or logs. Keep claims, credentials, link secrets, proof witnesses, and per-presentation data off-chain. If RPC, issuer status, or required metadata is unavailable, protected actions must fail closed.

## Demo evidence

A valid hackathon demo should show both a successful proof and rejected attempts for wrong nonce, replay, wrong task/audience, changed capability digest, expired challenge, tampered credential, inactive/unknown issuer, key mismatch, and RPC failure. It must label the NEAR registry as a public metadata anchor, not as an on-chain proof verifier or identity database. The opaque status root does not establish revocation or non-revocation.
