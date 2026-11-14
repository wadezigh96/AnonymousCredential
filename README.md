# ANONYMESH — Private Agentic Identity

ANONYMESH is a privacy-preserving identity and authorization protocol for **people and AI agents**. A human can delegate bounded authority to an AI agent; agents can prove authorization to other agents and services without disclosing unnecessary identity data.

**Current status: the official AnonCreds native release is integrated through its upstream Node.js wrapper in a Linux demo. Issuer → holder → verifier, CL-signature-backed presentations, selective disclosure, hidden expiry predicate, nonce binding and adversarial tests pass in CI (7/7). This is a demonstration slice, not production-ready; Android/Bionic execution, unlinkability analysis, privacy-preserving revocation and independent cryptographic review remain pending.**

## Required components

| Component | Intended capability | Status |
|---|---|---|
| Anonymous credentials | Agent credential issuance, private holder, verification | Demo prototype; official AnonCreds native wrapper; 7/7 CI tests pass on Linux x64; Android not yet verified |
| ZK proofs | Proof of credential possession and hidden-attribute predicates | AnonCreds CL-signature presentation and hidden expiry predicate work in demo; not a new standalone SNARK circuit |
| Selective disclosure | Reveal only verifier-requested claims | Demo reveals `agent_role`, keeps subject and expiry hidden; presentation excludes private subject marker |
| Challenge-response | Ed25519 signature over nonce, audience, task, capability digest and expiry; in-memory replay guard | Prototype implemented; 21/21 combined agent-auth CI tests passed; not anonymous/unlinkable |
| Unlinkable presentations | Randomized presentations and scoped pseudonyms where needed | Not implemented |
| Delegated capability | Signed parent-linked chain; exact audience/action/resource; expiry and quota attenuation | Prototype implemented; 21/21 CI tests passed; max delegation depth 8; no atomic quota accounting |
| Privacy-preserving revocation | Revocation proofs without exposing a stable holder identifier | Not implemented |
| NEAR | Issuer governance and privacy-reviewed status/root commitments | Preliminary registry scaffold; CI passed; not deployed |
| Local-first private AI | Holder wallet and agent runtime keep secrets local by default | Not implemented |
| Security controls | Anti-replay, rate limits, key rotation, deny-by-default policies | Not implemented |

## Engineering approach

Use maintained, independently reviewable cryptographic protocols and implementations. Do not invent cryptographic primitives. Compare candidate anonymous-credential systems for selective disclosure, unlinkability, predicates, revocation, platform support, maintenance and audit evidence before selecting dependencies.

See [docs/HACKATHON_MVP.md](docs/HACKATHON_MVP.md) for the NEAR Builders paths (testnet smart contracts, NEAR AI Cloud and optional Agent Connect) and time-boxed hackathon demo plan, [docs/ANONYMESH_ARCHITECTURE.md](docs/ANONYMESH_ARCHITECTURE.md) for the full architecture, [docs/CRYPTO_SELECTION.md](docs/CRYPTO_SELECTION.md) for cryptographic candidate evaluation, [docs/AUDIT.md](docs/AUDIT.md) for repository findings, and [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for security boundaries.


## AnonCreds demonstration slice

The new `packages/anoncreds-agent-demo` package uses the official `@hyperledger/anoncreds-nodejs` wrapper (Apache-2.0) and the official native `anoncreds-rs` v0.2.3 release. It does not substitute Ed25519 signatures for anonymous credentials.

- Agent A creates and holds a credential; the link secret stays holder-side.
- Agent B sends an AnonCreds presentation request with a fresh native nonce.
- Agent A reveals only `agent_role`; the private subject and `valid_until` remain hidden, with validity enforced as a predicate.
- The verifier checks the proof against its request, and a separate in-memory demo ledger binds the nonce to audience, task and capability digest and consumes it once.
- Adversarial coverage: forged/tampered credential, replay, changed audience/task/capability context, expired challenge, expired credential and mismatched presentation nonce.

GitHub Actions run [#43605244237](https://github.com/wadezigh96/AnonymousCredential/actions/runs/43605244237) passed **7/7** tests on Linux x64 / Node.js 22.14.0. The demo reported `valid: true`, `privateSubjectDisclosed: false`, and a proof JSON size of 18,137 bytes on that runner. These are CI demonstration measurements, not Android benchmarks.

Reproduce with `npm test --prefix packages/anoncreds-agent-demo`, `npm run demo --prefix packages/anoncreds-agent-demo`, and `npm run benchmark --prefix packages/anoncreds-agent-demo`. See [docs/ANONYMESH_ANDROID_VALIDATION.md](docs/ANONYMESH_ANDROID_VALIDATION.md) for the separate Android ARM64 acceptance plan. The official Node wrapper's Linux ARM64 library is not assumed to work on Android/Bionic; the intended Android route is the official React Native wrapper.

## Completion criteria

A feature is implemented only when code, reproducible positive and negative tests, adversarial tests, documentation, and performance/privacy measurements exist. Record proof generation time, verification time, memory use, proof size, NEAR gas where applicable, and known privacy leakage. A successful compile alone is not acceptance.

## Repository safety policy

Development is isolated on `feat/anonymesh-private-agent-identity`. `main` remains untouched. No deployment, chain transaction, merge, or external submission is authorized without explicit user approval.

## Privacy and security boundaries

Do not publish raw identity attributes, holder secrets, stable global identifiers, or per-presentation activity on-chain. Do not claim that a credential proves human uniqueness or agent safety. Do not promise absolute unlinkability: timing, network metadata, rare attribute combinations, issuer/verifier collusion and revocation mechanisms can create correlation risks. No post-quantum security is claimed.
## Current implementation slice

A preliminary NEAR issuer/status registry contract exists under `contracts/near/issuer-registry`. GitHub Actions run #13 (`c4f4f821`) passed all 14 unit tests and the `wasm32-unknown-unknown` release build using `cargo generate-lockfile`, `cargo test --locked`, and `cargo build --locked`. The generated lockfile exists only inside the ephemeral CI runner and is not committed; reproducible builds across runs still require committing a reviewed `Cargo.lock`. This verifies compilation and current unit-test cases only, not a security audit or protocol correctness. The contract does not verify credentials/ZK proofs or implement privacy-preserving revocation. No testnet deployment has occurred.
