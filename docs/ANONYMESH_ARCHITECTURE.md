# ANONYMESH — Protocol Architecture

Status: **design specification only; none of the protocol components below are claimed implemented.**

## 1. Goal and actors

ANONYMESH serves both people and AI agents. A human holder can obtain credentials and delegate bounded capabilities to one or more agents. An agent can prove that it holds a valid authorization for a particular verifier, audience and task without revealing the human's identity or unrelated credential claims.

Actors:
- **Issuer:** an approved organization or attester that issues a signed credential under a documented trust policy.
- **Human holder:** controls a private holder secret and human credentials.
- **Agent holder:** controls an agent key and receives a bounded delegated credential/capability.
- **Verifier:** requests and validates a presentation for a specific task.
- **NEAR registry:** publishes issuer authorization and versioned status/revocation commitments; it is not a personal-data database.
- **Local agent runtime:** stores holder material locally and enforces delegated permissions before tools/actions run.

## 2. Component architecture and status

| Layer | Required design | Status |
|---|---|---|
| Identity | Anonymous credentials for human and agent subjects; issuer, schema, expiry and holder binding | Not implemented |
| Cryptography | Reuse maintained ZK/credential libraries; no custom primitives | Not selected or implemented |
| Presentation | Selective disclosure and hidden-attribute predicates | Not implemented |
| Authentication | Challenge-response bound to fresh nonce, audience, verifier, task and expiry | Not implemented |
| Privacy | Unlinkable randomized presentations; pairwise pseudonyms only where explicitly required | Not implemented |
| Authorization | Attenuable delegated capabilities with action/resource/amount/quota/expiry limits | Not implemented |
| Revocation | Reviewed privacy-preserving revocation with witness/status update model | Not implemented |
| Blockchain | NEAR issuer registry and versioned public status commitments | Not implemented |
| Private AI | Local-first holder wallet and agent runtime | Not implemented |
| Security | Anti-replay, rate limits, key rotation, canonical encoding and deny-by-default policy engine | Not implemented |

## 3. Credential lifecycle

1. Holder creates a cryptographically random secret locally.
2. Issuer authenticates under a documented issuer policy and issues a credential bound to a holder-controlled secret or commitment.
3. Holder stores the credential and secret locally; raw identity data and secrets are never written to public chain state.
4. Verifier sends a presentation request specifying protocol version, audience, verifier identity, fresh unpredictable nonce, requested claims/predicates, action/resource scope and expiry.
5. Holder creates a randomized presentation revealing only requested claims and proving any required predicates.
6. Verifier checks issuer trust, signature/proof, audience, nonce, expiry, scope, revocation status and replay state.
7. Agent runtime checks the delegated capability and local policy before invoking any tool.

Credential schemas must distinguish `human` and `agent` subjects. Agent credentials must bind an agent public key to a delegator/controller relationship, allowed actions, resources, quotas, expiry and maximum delegation depth. A credential or issuer claim alone does not prove one-human-one-identity or that an agent is safe.

## 4. Cryptographic implementation selection

See [docs/CRYPTO_SELECTION.md](CRYPTO_SELECTION.md) for the source-backed candidate comparison and version-security gate.

Provisional first integration candidate: AnonCreds v1 / `anoncreds-rs` **v0.2.3 or later**, behind an adapter. This is a local prototype decision based on the issuer-holder-verifier lifecycle, selective disclosure, predicates, non-revocation proofs, active maintenance and Android ARM64 build workflow. It is not a production approval. The referenced CVE/advisory claim remains unverified; independently inspect the advisory database before choosing a safe version.

AnonCreds v2 remains the leading next-generation research candidate because it supports BBS and PS suites, additional ZK presentation capabilities and ALLOSAUR revocation. Its own repository says a comprehensive interoperable specification is still future work, so it is not the first integration dependency.

W3C BBS remains an interoperability candidate. Its 2026 specification is a Candidate Recommendation Draft and its interoperability report describes experimental implementations with pending/skipped and failed cases. BBS derived proofs provide selective disclosure and unlinkability, but the BBS cryptosuite alone does not supply the full predicate and revocation requirements.

SD-JWT VC is not sufficient as the primary privacy engine because ordinary selective disclosure is not by itself an unlinkable zero-knowledge derived proof.

No cryptographic dependency is added yet. Exact source versions, lockfile, platform build, upstream tests, regression tests and independent review are required before implementation is accepted.

## 5. Challenge-response and unlinkability

Every challenge must be single-use, unpredictable, short-lived and bound to protocol version, verifier, audience, requested task, resource, capability digest and canonical request encoding. Reject replay, cross-verifier use, altered task parameters, expired challenges and mismatched capability digests.

Presentations must be randomized where the selected scheme supports it. Avoid global stable subject identifiers. If rate limiting requires a pseudonym, derive it with explicit domain separation for the verifier and epoch; document the resulting linkability within that scope. Cryptographic unlinkability does not hide IP addresses, timing, network metadata, rare attribute combinations or issuer/verifier collusion.

## 6. Delegated capability model

A capability contains delegator and delegate key bindings, audience, allowed actions, resources, optional amount/quota/rate limits, not-before and expiry, maximum delegation depth, parent capability digest and revocation handle.

Delegation must be attenuating: a child capability cannot add actions, widen resources, increase limits, extend expiry or increase delegation depth beyond its parent. The runtime enforces policy before every tool invocation. High-impact actions require explicit human approval under local policy. The agent never receives the human holder's master secret.

## 7. Privacy-preserving revocation

Evaluate established accumulator/status approaches rather than designing a new accumulator. The decision must state whether the holder can prove non-revocation without disclosing a stable credential identifier, how witnesses are updated, whether queries leak membership, how issuers rotate keys, and what happens during stale-root or network failure. Revocation must fail closed for high-risk actions.

## 8. NEAR integration boundary

NEAR public state may contain issuer public keys and key versions, schema/protocol hashes, governance configuration and batched versioned status/revocation roots. It must not contain raw identity claims, holder secrets, credential IDs, stable secret-derived hashes or per-presentation activity.

Start with off-chain credential proof verification and on-chain issuer/status anchoring. Only consider on-chain proof verification after proof-system selection, verifier artifact pinning, contract tests and gas benchmarks. Define issuer suspension, key rotation, emergency freeze and root rollback governance.

## 9. Local-first runtime

Holder secrets and proof witnesses remain on the user's device by default. Remote proving is opt-in and must disclose exactly what witness data leaves the device. Store encrypted credentials, isolate human secrets from agent processes, redact secrets and claims from logs, and require explicit user consent for recovery/export. The agent runtime receives only narrowly scoped capabilities.

## 10. Security controls

- Canonical serialization and domain separation for every signed/proved request.
- Cryptographically secure nonce generation, expiry and replay cache.
- Rate limits by issuer/verifier/endpoint plus privacy-reviewed quota identifiers.
- Deny-by-default capability policy enforcement before tool execution.
- Issuer/holder/agent key rotation, suspension and revocation.
- Dependency pinning, SBOM, reproducible builds, vulnerability scanning and independent review.
- Secret-safe logs and telemetry; no raw claims, witness data or holder secrets.
- Explicit threat analysis for compromised agents, malicious issuers, colluding verifiers, relayers and chain observers.

## 11. Performance and privacy measurement

No benchmark results are claimed. Record device/OS, CPU architecture, library and compiler versions, credential schema and proof-system parameters. Measure credential issuance latency and size; proof generation p50/p95, peak memory and proof size; verification p50/p95 and CPU; witness refresh bandwidth and latency; NEAR gas/finality for registry updates; and runtime policy-check overhead.

Test at minimum on Android ARM64 and a desktop/server baseline. Evaluate privacy leakage across repeated presentations, different verifiers, issuer/verifier collusion, timing/network metadata, disclosed-claim combinations and revocation witness refresh.

## 12. End-to-end acceptance criteria

- Human holder obtains a credential without publishing identity or holder secret.
- Human delegates a bounded capability to Agent A.
- Agent B sends a fresh challenge bound to audience, task, nonce and expiry.
- Agent A produces a presentation proving required authorization while disclosing only requested claims.
- Agent B verifies issuer, proof, challenge, audience, expiry, scope and revocation.
- Replaying the presentation or changing nonce, audience, task or capability digest fails.
- A revoked or expired credential and an attenuated-away capability fail.
- Agent B receives `VALID` without learning the human identity or Agent A's private credential data.
- Two unrelated verifiers cannot correlate presentations through protocol-level stable identifiers.

## 13. Delivery sequence

1. Complete repository, dependency and historical-source audit.
2. Produce a protocol decision record comparing maintained credential and revocation libraries.
3. Specify schemas, issuer trust, holder binding, canonical encoding and privacy boundaries.
4. Implement a local credential issue/store/present/verify vertical slice using selected audited libraries.
5. Add challenge-response, selective disclosure, audience binding and replay-negative tests.
6. Add delegated capabilities and local policy enforcement.
7. Add privacy-preserving revocation and witness-update tests.
8. Add NEAR issuer/status anchoring and contract/gas tests.
9. Build the two-agent demo and benchmark/privacy evaluation suite.
10. Obtain independent security review before production claims.

## 14. Release gates

No custom cryptographic primitive, no public identity registry, no default remote proving, no public presentation log and no post-quantum claim. A feature is complete only with reproducible positive, negative and adversarial tests plus measured performance and documented privacy limits.

No changes to `main`, merge, deployment, chain transaction or hackathon submission are authorized without explicit user approval.