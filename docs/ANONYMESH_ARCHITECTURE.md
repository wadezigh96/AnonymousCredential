# ANONYMESH — Private Agentic Identity Infrastructure (PAII): Protocol Architecture

Status: **hybrid design specification plus tested implementation slices. The Node demo has separate issuer, holder and verifier processes using AnonCreds CL credentials and presentations; the verifier's required mode now reads and enforces a mocked read-only NEAR issuer record before authorization. The Android native smoke test is a single-process proof check, not the separate-role protocol demo. Unlinkability and privacy-preserving revocation are not implemented, and no contract is deployed.**

## PAII innovation category

**Private Agentic Identity Infrastructure (PAII)** is the innovation category proposed by ANONYMESH. It describes an infrastructure layer for privacy-preserving identity, trust and authorization across humans and autonomous AI agents. PAII is a project-defined category and positioning, not a claim that it is already an established industry standard or an official NEAR Hackathon track.

ANONYMESH is the protocol and reference implementation exploring this category. Its core proposition is that an agent should be able to prove a relevant authorization claim without unnecessarily revealing its private identity or its full credential.

PAII is organized around five design pillars:

1. **Private Identity:** anonymous credentials, selective disclosure and zero-knowledge proofs.
2. **Private Trust:** verifiable trust claims with minimized disclosure; privacy-preserving reputation remains research work.
3. **Delegated Authority:** bounded, attenuating capabilities between controllers and agents.
4. **Private Agent Governance:** challenge binding, anti-replay, revocation and policy enforcement.
5. **Agent Interoperability:** verification across independently operated agents and systems.

These pillars define the design taxonomy and roadmap. They do not imply that every capability is implemented. The status table and release gates below distinguish working slices from prototypes and planned work.

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
| Identity | Anonymous credentials for human and agent subjects; issuer, schema, expiry and holder binding | Agent demo credential implemented; human issuance and production identity binding not implemented |
| Cryptography | Reuse maintained ZK/credential libraries; no custom primitives | AnonCreds CL library used in Node demo and React Native wrapper used by Android smoke app; physical-device proof smoke test reported successful, but it is not a multi-process protocol test |
| Presentation | Selective disclosure and hidden-attribute predicates | Implemented in Node demo and Android smoke-test code; Linux CI proof tests pass and a physical-device smoke test was reported successful |
| Authentication | Ed25519 challenge-response bound to nonce, audience, task, capability digest and expiry | Prototype implemented; 9/9 tests passed; ordinary key-based auth, not anonymous |
| Privacy | Unlinkable randomized presentations; pairwise pseudonyms only where explicitly required | Not demonstrated; repeated-presentation correlation analysis absent |
| Authorization | Signed parent-linked capability chain; exact audience/action/resource; expiry/quota attenuation | Node verifier path now combines AnonCreds, credential-bound issuer/agent keys, read-only registry trust, proof-of-possession, replay, and quota checks; not a production tool policy engine |
| Revocation | Reviewed privacy-preserving revocation with witness/status update model | Not implemented |
| Blockchain | NEAR issuer registry and versioned public status commitments | Preliminary registry scaffold plus Node read adapter; local mocked-RPC integration passes; no live deployment or on-chain mutation |
| Private AI | Local-first holder wallet and agent runtime | Not implemented |
| Security | Anti-replay, rate limits, distributed replay protection and deny-by-default policy engine | AnonCreds role demo uses an in-memory single-process challenge ledger; separate Node runtime has memory/SQLite authorization-store slices; rate limits, distributed service integration and production policy enforcement are not implemented |

## 3. Credential lifecycle

1. Holder creates a cryptographically random secret locally.
2. Issuer authenticates under a documented issuer policy and issues a credential bound to a holder-controlled secret or commitment.
3. Holder stores the credential and secret locally; raw identity data and secrets are never written to public chain state.
4. Verifier sends a presentation request specifying protocol version, audience, verifier identity, fresh unpredictable nonce, requested claims/predicates, action/resource scope and expiry.
5. Holder creates a randomized presentation revealing only requested claims and proving any required predicates.
6. Verifier checks registry-backed issuer trust, signature/proof, audience, nonce, expiry, scope, and replay state; the opaque status root is not revocation proof.
7. Agent runtime checks the delegated capability and local policy before invoking any tool.

Credential schemas must distinguish `human` and `agent` subjects. Agent credentials must bind an agent public key to a delegator/controller relationship, allowed actions, resources, quotas, expiry and maximum delegation depth. The current demo's `agent_subject` is a fixed sample marker, not that binding. A credential or issuer claim alone does not prove one-human-one-identity or that an agent is safe.

## 4. Cryptographic implementation selection

See [docs/CRYPTO_SELECTION.md](CRYPTO_SELECTION.md) for the source-backed candidate comparison and version-security gate.

**Current ZK proof engine:** the runnable Node.js Issuer–Holder–Verifier demo uses the Hyperledger AnonCreds CL credential and presentation implementation. A holder creates a presentation against the verifier's original request, selectively discloses only requested claims, and proves hidden predicates such as expiry without returning the holder's link secret or hidden subject attribute. This is the project's implemented credential-based zero-knowledge presentation path.

Keep the cryptographic roles distinct: AnonCreds presentation verification is the ZK credential proof; Ed25519 proof-of-possession is a conventional signature proving control of the credential-bound agent key; capability verification is an authorization check. None substitutes for the others. The current flow does not claim general-purpose zk-SNARK/zk-STARK support or on-chain proof verification.

**Rust integration status:** the separate `anoncreds-rs` integration remains blocked. Upstream `anoncreds-rs` v0.2.3 is the patched release for GHSA-89r4-4c4j-7wx9 (affected 0.2.2, patched 0.2.3; advisory page lists no CVE ID), but its `anoncreds-clsignatures 0.3.2` dependency path reaches `glass_pumpkin 1.6.x` and yanked `core2 0.4.0`; upstream issue #372 remains open and docs.rs reports a failed build. The advisory fix and build blocker are separate. Do not add this Rust dependency until a reproducible supported build exists.

AnonCreds v2 remains a next-generation research candidate because it supports BBS and PS suites, additional ZK presentation capabilities and ALLOSAUR revocation. Its own repository says a comprehensive interoperable specification is still future work. W3C BBS remains an interoperability candidate; derived proofs offer selective disclosure and unlinkability, but the cryptosuite alone does not supply the full predicate and revocation requirements. Ordinary SD-JWT VC disclosure is not a replacement for an unlinkable zero-knowledge derived proof.

The existing Node AnonCreds dependency is implemented and tested in the demo; no additional cryptographic dependency is added by this design update. Exact source versions, lockfiles, platform builds, upstream tests, regression tests and independent review remain required for any new cryptographic integration.

## 5. Challenge-response and unlinkability

Every challenge must be single-use, unpredictable, short-lived and bound to protocol version, verifier, audience, requested task, resource, capability digest and canonical request encoding. Reject replay, cross-verifier use, altered task parameters, expired challenges and mismatched capability digests.

Presentations must be randomized where the selected scheme supports it. Avoid global stable subject identifiers. If rate limiting requires a pseudonym, derive it with explicit domain separation for the verifier and epoch; document the resulting linkability within that scope. Cryptographic unlinkability does not hide IP addresses, timing, network metadata, rare attribute combinations or issuer/verifier collusion.

## 6. Delegated capability model

A capability contains delegator and delegate key bindings, audience, allowed actions, resources, optional amount/quota/rate limits, not-before and expiry, maximum delegation depth, parent capability digest and revocation handle.

Delegation must be attenuating: a child capability cannot add actions, widen resources, increase limits, extend expiry or increase delegation depth beyond its parent. The runtime enforces policy before every tool invocation. High-impact actions require explicit human approval under local policy. The agent never receives the human holder's master secret.

## 7. Privacy-preserving revocation

Evaluate established accumulator/status approaches rather than designing a new accumulator. The decision must state whether the holder can prove non-revocation without disclosing a stable credential identifier, how witnesses are updated, whether queries leak membership, how issuers rotate keys, and what happens during stale-root or network failure. Revocation must fail closed for high-risk actions.

## 8. Private-chain integration boundary

**Network requirement:** ANONYMESH is designed for a private, permissioned network. NEAR Mainnet and NEAR Public Testnet are not the target execution or storage networks for private identities, credentials, proofs, or agent-to-agent payment activity. The previous hackathon testnet deployment profile is superseded by this requirement.

The intended deployment is a NEAR-compatible ANONYMESH network whose validator membership, node access, RPC endpoints, contract deployment and participant accounts are governed by an explicit consortium/operator policy. Localnet is suitable for isolated development and reproducible tests; it is not production infrastructure. A production private network requires independently operated permissioned validators, authenticated/private RPC, key management, network monitoring, backup/recovery, governance and documented validator admission/removal.

NEAR's separately operated Private Shard is a possible integration candidate, not an assumed deployment. Its published architecture describes permissioned validators and a bridge to NEAR Mainnet; that does not automatically make it equivalent to an isolated ANONYMESH private chain. Evaluate its access model, bridge disclosure, operational availability, contract compatibility and transaction privacy before selecting it. Do not route ANONYMESH private activity through a public chain merely because a bridge or public settlement path exists.

The private-chain contract may store only the minimum public-to-authorized-network metadata required for operation: issuer public keys and versions, schema/protocol hashes, governance configuration, and batched status/revocation commitments. Raw identity claims, holder secrets, credential IDs, stable secret-derived hashes and per-presentation activity must never be written to contract state or logs. Restrict read access where supported, but do not treat RPC access control as a substitute for cryptographic privacy: validators and authorized infrastructure operators may still observe execution/state unless the selected private execution design prevents it.

**Identity anchor and payments:** a persistent identity NFT or equivalent registry anchor may represent an agent's durable identity handle inside the permissioned network. The token ID and owner mapping must not be exposed as a universal transaction identifier. Routine interactions use domain-separated pairwise pseudonyms and scoped nullifiers; the verifier checks a ZK proof binding the holder's secret/credential to an authorized identity commitment. The current AnonCreds demo does not yet implement this NFT-to-credential binding or prove arbitrary NFT ownership. Do not claim that it does.

Agent A's payment to Agent B is authorized by a proof and an attenuating payment capability (recipient, asset, amount/limit, expiry, nonce and policy scope). Settlement must occur within the permissioned network's payment contract/token system. Public-chain withdrawals, bridges or public token transfers are separate opt-in actions and can reveal amounts, timing, addresses or linkage; they are not private by default. The ZK identity proof does not by itself hide payment metadata.

Start with off-chain credential proof verification and private-chain issuer/status anchoring. Only consider on-chain proof verification after proof-system selection, verifier artifact pinning, contract tests and gas benchmarks. The current NEAR issuer-registry contract is a preliminary scaffold; it has not been deployed to an ANONYMESH private network and does not verify AnonCreds proofs on-chain.


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

A 20-iteration Linux x64 demo benchmark is reported in the repository README; those host-specific figures are not Android/Bionic measurements and must not be generalized to the user's phone or production workloads. Record device/OS, CPU architecture, library and compiler versions, credential schema and proof-system parameters. Measure credential issuance latency and size; proof generation p50/p95, peak memory and proof size; verification p50/p95 and CPU; witness refresh bandwidth and latency; NEAR gas/finality for registry updates; and runtime policy-check overhead.

Test at minimum on Android ARM64 and a desktop/server baseline. Evaluate privacy leakage across repeated presentations, different verifiers, issuer/verifier collusion, timing/network metadata, disclosed-claim combinations and revocation witness refresh.

## 12. End-to-end acceptance criteria

- Human holder obtains a credential without publishing identity or holder secret.
- Human delegates a bounded capability to Agent A.
- Agent B sends a fresh challenge bound to audience, task, nonce and expiry.
- Agent A produces a presentation proving required authorization while disclosing only requested claims.
- Agent B verifies issuer, proof, challenge, audience and expiry. Capability scope and delegate proof-of-possession must be checked by the separate authorization-runtime prototype; this is not yet joined to the AnonCreds presentation flow. Revocation verification remains unimplemented.
- Replaying the presentation or changing nonce, audience, task or capability digest fails.
- A revoked or expired credential and an attenuated-away capability fail.
- Agent B receives `VALID` for the tested credential role/expiry proof without learning the private subject marker. This result alone does not prove capability authorization, unlinkability or human-controller binding.
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
## 15. Private-network deployment profile

Development and CI may use isolated localnet or mocked RPC. Integration acceptance must run against an isolated ANONYMESH private network with permissioned validators and private RPC. Production rollout is blocked until validator governance, network isolation, confidential transaction visibility, key custody, recovery, monitoring and independent security review are documented and tested. NEAR Mainnet and NEAR Public Testnet are explicitly out of scope for private identity and payment data.

No changes to `main`, merge, deployment, chain transaction or external submission are authorized without explicit user approval.
