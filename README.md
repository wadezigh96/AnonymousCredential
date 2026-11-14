# ANONYMESH — Private Agentic Identity

ANONYMESH is a privacy-preserving identity and authorization protocol for **people and AI agents**. A human can delegate bounded authority to an AI agent; agents can prove authorization to other agents and services without disclosing unnecessary identity data.

**Current status: audit and protocol design. No requested protocol feature is currently implemented.**

## Required components

| Component | Intended capability | Status |
|---|---|---|
| Anonymous credentials | Human and agent credential issuance, private holder, verification | Not implemented |
| ZK proofs | Proof of credential possession and hidden-attribute predicates | Not implemented |
| Selective disclosure | Reveal only verifier-requested claims | Not implemented |
| Challenge-response | Fresh nonce, audience, task and expiry binding | Not implemented |
| Unlinkable presentations | Randomized presentations and scoped pseudonyms where needed | Not implemented |
| Delegated capability | Attenuable agent permissions and local policy enforcement | Not implemented |
| Privacy-preserving revocation | Revocation proofs without exposing a stable holder identifier | Not implemented |
| NEAR | Issuer governance and privacy-reviewed status/root commitments | Not implemented |
| Local-first private AI | Holder wallet and agent runtime keep secrets local by default | Not implemented |
| Security controls | Anti-replay, rate limits, key rotation, deny-by-default policies | Not implemented |

## Engineering approach

Use maintained, independently reviewable cryptographic protocols and implementations. Do not invent cryptographic primitives. Compare candidate anonymous-credential systems for selective disclosure, unlinkability, predicates, revocation, platform support, maintenance and audit evidence before selecting dependencies.

See [docs/HACKATHON_MVP.md](docs/HACKATHON_MVP.md) for the NEAR Builders paths (testnet smart contracts, NEAR AI Cloud and optional Agent Connect) and time-boxed hackathon demo plan, [docs/ANONYMESH_ARCHITECTURE.md](docs/ANONYMESH_ARCHITECTURE.md) for the full architecture, [docs/CRYPTO_SELECTION.md](docs/CRYPTO_SELECTION.md) for cryptographic candidate evaluation, [docs/AUDIT.md](docs/AUDIT.md) for repository findings, and [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for security boundaries.

## Completion criteria

A feature is implemented only when code, reproducible positive and negative tests, adversarial tests, documentation, and performance/privacy measurements exist. Record proof generation time, verification time, memory use, proof size, NEAR gas where applicable, and known privacy leakage. A successful compile alone is not acceptance.

## Repository safety policy

Development is isolated on `feat/anonymesh-private-agent-identity`. `main` remains untouched. No deployment, chain transaction, merge, or external submission is authorized without explicit user approval.

## Privacy and security boundaries

Do not publish raw identity attributes, holder secrets, stable global identifiers, or per-presentation activity on-chain. Do not claim that a credential proves human uniqueness or agent safety. Do not promise absolute unlinkability: timing, network metadata, rare attribute combinations, issuer/verifier collusion and revocation mechanisms can create correlation risks. No post-quantum security is claimed.
## Current implementation slice

A first NEAR issuer/status registry contract has been added under `contracts/near/issuer-registry`. It stores public issuer metadata and monotonically versioned status roots only. It does not verify credentials or ZK proofs and does not implement privacy-preserving revocation. Unit tests and a GitHub Actions workflow are present, but a successful CI run has not yet been verified. No deployment has occurred.
