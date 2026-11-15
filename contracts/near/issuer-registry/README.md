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

NEAR SDK 5.30.1 requires Rust 1.95 or later. Check the installed compiler before attempting a build. Fourteen unit tests are included. The committed `Cargo.lock` pins the resolved dependency graph, and the GitHub Actions workflow runs both `cargo test --locked` and the WASM release build with `--locked`. The recorded NEAR contract workflow run [#13](https://github.com/wadezigh96/anonymesh/actions/runs/43632319085) passed all 14 tests and the WASM release build. This is CI evidence, not an independent security review.

## Testnet deployment

Do not deploy automatically. First pass local tests, reproducible WASM build, contract review and testnet configuration review. Deployment requires explicit approval.
