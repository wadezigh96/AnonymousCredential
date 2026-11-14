# ANONYMESH — NEAR Hackathon MVP Plan

Date: 2026-11-14
Target: NEAR Hackathon public prototype
Network: **NEAR testnet only**
Status: scope and acceptance plan; not an implementation report.

## 1. Time-boxed objective

Prioritize one demonstrable end-to-end privacy and agent-authorization flow over broad protocol completeness. The hackathon deadline published by the official event page is 2026-11-14 23:59 UTC. For Singapore time (UTC+8), that is 2026-11-15 07:59. Confirm the live submission form before relying on this conversion or deadline.

Primary track fit: **AI Security & Defense** (agent security, policy engines and sandboxed authorization). Secondary fit may include **Agent Economy** or **Open Innovation** if the actual demo supports those claims. The event permits a project to select multiple fitting tracks; do not claim a track without checking the current submission form.

## 2. NEAR AI Gateway — correct role

`https://gateway.near.ai/` currently describes a macOS desktop application for routing supported coding-agent tools (Claude Code, Codex and OpenCode) through NEAR AI private models and for reviewing/redacting coding traces before optional sharing.

It is **not documented here as a public application API or an on-chain testnet service**. Do not make ANONYMESH runtime depend on the desktop app, and do not send holder secrets, credential witnesses, private attributes or user credentials to it.

The official Gateway download page lists macOS 14 or later and Apple silicon/Intel. It does not list Android or Termux support. Therefore it cannot be installed natively in the user's Android/Termux environment based on the published requirements. If a separate compatible Mac is available, it can be used as an optional developer-tooling route; otherwise continue using the existing local coding workflow.

Gateway trace sharing is a separate opt-in data flow. Keep trace contribution disabled unless the user explicitly reviews and approves the specific redacted traces and data uses. Never treat installation or sign-in as permission to share source code or session traces.

## 3. Testnet-first architecture

- NEAR testnet is the only chain target for the hackathon demo.
- Use a dedicated testnet account and testnet-only configuration. Never put mainnet account IDs, keys or RPC endpoints in the demo configuration.
- Contract stores only issuer public-key/version records, schema/protocol hashes and versioned status/revocation commitments needed for verification.
- No human names, emails, phone numbers, raw credential claims, holder secrets, credential identifiers, proof witnesses or per-presentation logs on-chain.
- Credential issuance and proof generation remain off-chain and local to the holder. Verification can run in the demo service; the contract is a public trust/status anchor, not a private data store.
- Keep testnet contract calls and deploy steps separate from local tests. No mainnet deployment or mainnet transaction is part of this plan.

## 4. Minimum viable demonstration

1. Issuer publishes its public key/version and schema hash to the testnet registry.
2. Human or agent holder obtains a test credential using the selected credential library after dependency and advisory review.
3. Holder stores credential material locally; no private credential data is uploaded.
4. Agent B requests a challenge containing a fresh nonce, audience, task/action scope and expiry.
5. Agent A returns a presentation/proof and a delegated capability bound to the challenge and agent key.
6. Verifier checks issuer trust, credential proof, challenge freshness, audience, task scope, expiry and revocation state.
7. Demo displays VALID or REJECTED and the public testnet transaction/hash for the registry setup only. Do not expose holder identity.

If full AnonCreds proof generation cannot be made reliable within the timebox, do not fake it or label a signature-only mock as ZK. Show the working testnet registry and a clearly labelled local cryptographic prototype, and list unimplemented proof/revocation pieces honestly.

## 5. Required negative tests

- Replayed nonce is rejected.
- Wrong audience or task/action is rejected.
- Modified capability digest is rejected.
- Expired challenge/capability is rejected.
- Revoked or unknown issuer/key version is rejected.
- Credential substitution or holder-binding mismatch is rejected.
- Child capability cannot widen parent actions, resources, expiry or quota.
- Testnet RPC unavailable or status root stale causes a fail-closed result for protected actions.

## 6. Hackathon deliverables

- Public repository with reproducible local setup and test instructions.
- Testnet contract source, deployment configuration and verifiable testnet transaction reference, only after explicit approval to deploy.
- Demo script/video showing successful and rejected presentations without exposing private identity.
- README accurately labels implemented, mocked and planned features.
- Threat model and benchmark notes; no unsupported production/privacy claims.

Official event information: [NEAR Hackathon](https://nearhackathon.com/). Gateway: [NEAR AI Gateway](https://gateway.near.ai/), [download requirements](https://gateway.near.ai/download/), [data handling](https://gateway.near.ai/your-data/).

## 7. Explicit safety boundary

Testnet is not a security guarantee. Use only disposable test credentials and testnet funds. No mainnet transaction, mainnet deployment, wallet import, private-key upload, trace sharing, hackathon submission or X post is authorized by this plan. Obtain explicit user approval for each external action.