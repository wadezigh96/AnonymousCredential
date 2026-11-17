# ANONYMESH NEAR Issuer Registry

Minimal testnet-oriented registry contract. It stores only public issuer metadata:
- issuer NEAR account ID;
- issuer public key string and monotonically increasing key version;
- schema hash;
- active/inactive flag;
- monotonically increasing status epoch and public status root.

## Explicit limitations

This contract does **not** verify AnonCreds/BBS/ZK proofs, does not implement a privacy-preserving accumulator, and does not establish human uniqueness. The status root is only an opaque public commitment; no non-revocation proof is checked on-chain. A verifier must independently validate credential proofs and status witnesses off-chain.

The owner is a single administrator in this first test slice. Production governance, multisig, issuer self-registration, key recovery and emergency rotation are not implemented.

Do not put names, emails, raw credential claims, holder secrets, credential IDs, proof witnesses or presentation events on-chain.

## Storage deposit policy

Every owner mutation that persists issuer state measures `env::storage_usage()` before and after the mutation. Positive storage growth is multiplied by the runtime `env::storage_byte_cost()` and must be covered by the call's attached deposit. If the deposit is insufficient, the method panics and the NEAR transaction rollback leaves the prior state unchanged. If the deposit exceeds the measured cost, the excess is refunded to the predecessor account through a detached transfer. Mutations with no positive storage growth require no storage deposit and refund any attached deposit.

This policy applies to `register_issuer`, `set_issuer_active`, and `update_status_root`. It is an economic guard for persistent state growth, not a replacement for owner governance or a production multisig policy.

## Local tests

From this directory:

```sh
cargo test --locked
```

Build instructions for a compatible Rust toolchain:

```sh
rustup target add wasm32-unknown-unknown
cargo build --locked --target wasm32-unknown-unknown --release
```

NEAR SDK 5.30.1 requires Rust 1.95 or later. Check the installed compiler before attempting a build. The committed `Cargo.lock` pins the resolved dependency graph, and the GitHub Actions workflow runs both `cargo test --locked` and the WASM release build with `--locked`. The workflow also uploads the exact `anonymesh_issuer_registry.wasm` together with `SOURCE_SHA.txt`, `BUILD_COMMAND.txt`, and `SHA256SUMS.txt` under an artifact named `anonymesh-issuer-registry-wasm-<source-sha>`. This is CI evidence, not an independent security review.

## Testnet deployment

Do not deploy automatically. First pass local tests, reproducible WASM build, contract review, storage/deposit review and testnet configuration review. Download the workflow artifact, verify `SOURCE_SHA.txt` matches the intended source commit, verify `BUILD_COMMAND.txt`, and recompute the SHA-256 from the WASM before deployment. Deployment requires an available testnet signer, funded deployer and explicit approval. The Node verifier's registry integration is tested locally with a deterministic RPC mock; it is not live-chain evidence.
