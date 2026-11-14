# ANONYMESH Agent Challenge-Response (prototype)

This crate implements one narrow, real cryptographic slice: Ed25519 proof-of-possession over a domain-separated challenge transcript, with audience, task, capability digest, nonce and expiry binding.

## What it does

- Verifies Ed25519 signatures using `ed25519-dalek`.
- Rejects expired challenges.
- Binds signatures to exact audience, task, capability digest and expiry values.
- Rejects replayed nonces within one in-memory verifier process.
- Bounds replay-cache entries and fails closed when full.

## What it does NOT do

- It is **not** an anonymous credential or zero-knowledge proof.
- It does not hide the signing public key or make presentations unlinkable.
- It does not implement issuer trust, credential issuance, selective disclosure or revocation.
- It does not enforce the capability itself; it only binds a supplied capability digest into the signed challenge.
- Its replay cache is process-local and not suitable for multi-instance production deployment without shared durable replay state.

The same key used for ordinary Ed25519 authentication is linkable. Do not describe this crate as private identity. It is a testable agent-authentication building block that will later be paired with an anonymous credential presentation.

## Run

```sh
cargo test --manifest-path crates/agent-auth/Cargo.toml
```
