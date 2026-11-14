# ANONYMESH — Private Agentic Identity

ANONYMESH is an open protocol foundation for privacy-preserving identity and authorization for **people and AI agents**.

The project is being developed audit-first. The initial implementation is deliberately narrow: a Circom membership proof with a scope-specific nullifier and an action-binding output, plus an issuer-controlled Merkle-root registry. It is **not yet a production anonymous-credential system**.

## Design goals

- A person can authorize an AI agent without publishing their real-world identity.
- A human or agent can prove membership in an issuer-approved credential set.
- Verifiers learn only the public statement required for a particular action.
- Proofs are bound to a scope and a canonical action/request digest.
- Nullifiers prevent repeated use within a defined scope.
- Private attributes and secrets stay with the holder; public chains store roots and verification outcomes only.

## Current status

| Area | Status |
|---|---|
| Historical code audit | Initial findings documented in `docs/AUDIT.md` |
| Membership circuit | Prototype implemented; requires compile/test and independent review |
| Root registry | Minimal issuer-controlled prototype |
| Credential issuance | Not implemented |
| Human/agent credential schema | Specification work required |
| Delegated agent capabilities | Not implemented |
| Selective attribute disclosure | Not implemented |
| NEAR integration | Not implemented |
| Production readiness | **Not ready** |

## Repository policy

Work is being done on `feat/anonymesh-private-agent-identity`. The `main` branch is intentionally untouched. No deployment, transaction, merge, or hackathon submission is authorized by this work.

## Security boundary

The current circuit proves knowledge of a secret whose commitment is included under a published Merkle root. It does not prove that an issuer performed real-world identity checks, that a human is unique, that an agent is safe, or that a credential's attributes are true. Those claims require a separately specified and audited issuance/signature protocol.

See [docs/AUDIT.md](docs/AUDIT.md) and [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).
