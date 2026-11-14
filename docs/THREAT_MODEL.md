# ANONYMESH — PAII Threat Model

**Category:** Private Agentic Identity Infrastructure (PAII)  
**Project:** ANONYMESH  
**Status:** Design threat model for a hybrid protocol specification and prototype. This document distinguishes security requirements from controls demonstrated by the current repository. It is not an independent security audit or a production security claim.

## 1. Purpose and security objectives

ANONYMESH explores infrastructure for privacy-preserving identity, trust and authorization across humans and autonomous AI agents. The threat model covers five PAII pillars:

1. **Private Identity:** protect holder secrets and minimize identity disclosure.
2. **Private Trust:** let verifiers validate issuer and credential claims without creating unnecessary correlation.
3. **Delegated Authority:** prevent stolen, forged or over-broad agent capabilities from authorizing actions.
4. **Private Agent Governance:** constrain replay, revocation, key compromise and policy bypass.
5. **Agent Interoperability:** preserve security and privacy when agents, issuers and verifiers operate in different administrative domains.

Primary security objectives:

- A verifier learns only the claims and predicates required for its decision.
- A proof is bound to the intended verifier, audience, task, resource, protocol version and freshness context.
- A credential or capability cannot be replayed or widened to authorize a different action.
- A compromised agent cannot silently acquire its controller's broader authority.
- Unrelated verifiers should not be able to correlate presentations through protocol-level stable identifiers.
- Public NEAR state contains issuer and status metadata only, never holder secrets, raw personal claims or presentation activity.
- Security failures that affect protected actions fail closed.

A valid credential proof is not, by itself, authorization to execute a tool, transfer funds or perform another action. Proof verification, capability validation and runtime policy enforcement are separate decisions.

## 2. System scope and trust boundaries

### Actors

- **Human controller:** owns or controls an identity and may delegate limited authority.
- **Agent holder:** operates with its own key and a bounded capability; it must not receive the human holder's master secret.
- **Issuer:** validates an issuance policy and signs credentials.
- **Verifier / relying agent:** requests and validates a presentation for a particular purpose.
- **Agent runtime / tool host:** enforces capability and local policy immediately before an action.
- **NEAR registry:** publishes issuer keys, versions, schema/protocol hashes and public status commitments.
- **RPC provider, relayer and network observer:** may observe requests, timing, addresses and network metadata.

### Trust boundaries

1. **Controller ↔ agent:** delegation must be explicit, scoped, expiring and revocable. The agent is not automatically trusted because its controller is trusted.
2. **Issuer ↔ holder:** issuance is a trust decision. A cryptographically valid credential does not prove that the issuer's original claim was honest.
3. **Holder ↔ verifier:** presentations are untrusted input. The verifier must validate proof, request context, freshness and issuer state before accepting them.
4. **Verifier ↔ runtime/tools:** a successful proof must not bypass capability and local policy checks.
5. **Local device ↔ network/cloud:** secrets and proof witnesses should remain local by default. Remote proving or telemetry requires an explicit, documented data boundary.
6. **Application ↔ NEAR/RPC:** chain data is public and may be stale, unavailable or adversarially relayed. No private credential data belongs on-chain.

### Out of scope for the current prototype

The current repository is not a complete production protocol. In particular, production transport authentication, durable distributed replay protection, privacy-preserving revocation, unlinkability guarantees, a local-first agent runtime and production policy enforcement are not provided.

## 3. Assets and security impact

| Asset | Examples | Impact if compromised |
|---|---|---|
| Holder secrets | AnonCreds link secret, credential-opening material, private keys | Impersonation, credential misuse or privacy loss |
| Human identity data | Names, account relationships, private attributes | Identity disclosure, profiling or account targeting |
| Agent identity | Agent signing key, controller binding, agent credential | Agent impersonation or unauthorized delegation |
| Credentials | Credential contents, issuer signature, schema and validity | False authorization or disclosure of private claims |
| Capabilities | Signed delegation chain, scope, limits, expiry and parent digest | Unauthorized tool use, resource access or financial action |
| Challenge/replay state | Nonce, audience, task digest, consumed state | Replay or cross-context proof acceptance |
| Issuer trust state | Issuer key, key version, suspension and status root | Acceptance of forged, compromised or stale credentials |
| Runtime policy | Tool allowlists, action/resource restrictions, human approval rules | Policy bypass and unsafe execution |
| Privacy metadata | Pairwise pseudonyms, timestamps, IPs, verifier logs | Cross-session correlation and profiling |
| Build and verifier artifacts | Dependency lockfiles, schemas, verifier keys and WASM | Supply-chain compromise or inconsistent verification |

## 4. Adversaries and capabilities

Assume one or more of the following may be malicious or compromised:

- A **malicious holder** submits malformed, expired, substituted or replayed presentations.
- A **compromised agent** attempts to exceed its delegated scope, exfiltrate keys or trick its runtime.
- A **capability thief** obtains a copied token, capability document, signing key or local credential store.
- A **malicious verifier** requests excessive attributes, reuses challenges, stores presentations or tries to correlate users.
- **Colluding verifiers** exchange logs, challenge metadata, timestamps, requested attributes or pseudonyms.
- A **malicious issuer** issues false claims, correlates issuance and presentation records, or abuses key rotation.
- A **compromised issuer key** is used to mint apparently valid credentials.
- A **network observer / RPC provider / relayer** correlates IP addresses, timing, transaction metadata and request volume.
- A **chain observer** analyzes public account IDs, contract events, issuer updates and status-root timing.
- A **malicious dependency or build pipeline** substitutes code, native libraries, schema definitions or verifier artifacts.

The model does not assume that cryptography can hide endpoint compromise, malware on a holder device, voluntary disclosure by a user, or all network-level metadata.

## 5. Threat register

Severity describes potential impact, not a claim that the exploit has been observed.

| ID | Threat | Impact | Required controls | Current evidence / gap |
|---|---|---|---|---|
| T-01 | Agent key theft or cloning | Attacker impersonates Agent A | Hardware-backed or OS-protected key where available; key rotation; controller revocation; proof-of-possession | No production agent key custody or recovery flow |
| T-02 | Agent/controller binding confusion | Attacker presents an agent credential under the wrong controller or role | Explicit subject/key binding; issuer policy; audience and controller relationship checks | Demo credential's `agent_subject` is a fixed marker, not cryptographically bound to an agent public key or controller; production human/agent identity binding is not implemented |
| T-03 | Credential substitution or holder-secret theft | Attacker uses another holder's credential or learns private claims | Holder binding; local encrypted storage; process isolation; secret-safe logs; recovery and rotation policy | Demo protects link secret within holder process; production wallet/storage controls absent |
| T-04 | Sybil identities or dishonest issuer | False trust, duplicate identities or fabricated reputation | Issuer governance, assurance levels, audit and privacy-aware uniqueness policy | No one-person-one-identity or Sybil-resistance guarantee |
| T-05 | Cross-presentation correlation | Verifiers link sessions belonging to the same holder/agent | Randomized presentations; avoid global IDs; pairwise domain-separated pseudonyms only when necessary; privacy testing | Selective disclosure exists in demo; unlinkability is not demonstrated |
| T-06 | Verifier collusion | Multiple verifiers combine records to identify or profile a holder | Minimize disclosed attributes; verifier-specific pseudonyms; purpose limitation; retention limits; independent verifier domains | No collusion-resistance study or protocol-level unlinkability claim |
| T-07 | Rare-attribute fingerprinting | Attribute combinations identify a person even without a name | Minimize predicates; coarsen values; suppress rare combinations; review disclosure policy | No attribute-inference or fingerprinting evaluation |
| T-08 | Network and timing correlation | IP, timing, request size or RPC patterns reveal relationships | Privacy-preserving transport architecture; batching or relaying where appropriate; metadata minimization | Local demo uses loopback; no network anonymity or metadata protection |
| T-09 | Capability theft or replay | Stolen capability is reused by another agent or in another context | Key-bound proof-of-possession; audience/action/resource binding; short expiry; challenge binding; revocation; atomic one-time/usage accounting | Separate Node runtime prototype verifies delegate proof-of-possession and can consume nonce/quota; SQLite store has restart-persistence tests, but this path is not integrated into the issuer-holder-verifier HTTP demo or a production runtime |
| T-10 | Capability escalation through delegation | Child capability gains broader authority than parent | Verify parent digest and delegator continuity; enforce attenuation of actions, resources, expiry, limits and depth | Node and Rust prototypes test signature/parent continuity and scope/expiry/quota attenuation; the Node authorization runtime is a separate tested slice, not integrated with the three-role HTTP demo |
| T-11 | Confused deputy / task substitution | Agent uses valid authority for a different tool, recipient or task | Canonical action digest; exact audience, action and resource binding; runtime re-check immediately before execution | Node authorization runtime tests bind capability digest, audience, action, resource and delegate key to an Ed25519 request proof; however AnonCreds presentation does not itself prove the capability, and the two flows are not integrated end-to-end |
| T-12 | Replay or race condition | Same proof or capability is accepted twice | Fresh unpredictable nonce; atomic consume-once storage; expiry; concurrency tests; durable replay state | Node demo nonce ledger is in-memory and single-process |
| T-13 | Malicious or compromised issuer | Forged or misleading claims are trusted | Issuer allowlist/governance; key versioning; suspension; independent audit; issuance transparency with privacy safeguards | Preliminary NEAR registry scaffold; no complete governance or incident response |
| T-14 | Revocation or stale status | Revoked credential remains accepted, or status query leaks identity | Privacy-preserving witness/status scheme; freshness policy; fail-closed behavior; key/status rotation | Privacy-preserving revocation is not implemented; NEAR root is an opaque commitment |
| T-15 | NEAR metadata leakage or false trust | Public events correlate activity or stale/invalid issuer state is trusted | Store only public issuer metadata and batched commitments; validate account/key/version; freshness checks; no per-presentation events | Contract is not deployed; no end-to-end verifier-to-registry status proof |
| T-16 | Verifier/parser or dependency compromise | Malformed proof causes crash, bypass or code execution; wrong crypto artifact accepted | Strict parsing; pinned dependencies; reproducible builds; SBOM; fuzzing; independent review | CI and dependency checks are partial; no independent audit |
| T-17 | Runtime policy bypass | Valid proof is treated as permission to execute a high-impact action | Deny-by-default policy engine; capability check before every call; human approval for sensitive actions; audit-safe receipts | Production local-first agent runtime is not implemented |
| T-18 | Logging and telemetry leakage | Secrets, credentials or presentation data enter logs | Redaction; structured allowlisted telemetry; no raw proof/witness/claim logging; log access and retention policy | Production telemetry controls are not implemented |

## 6. Focus area: agent identity compromise

An agent identity is not simply a display name or a controller's identity. It should be represented by a key-controlled agent subject, with an explicit and verifiable relationship to its delegator where required.

Required design rules:

- Bind an agent credential or capability to the agent's public key, issuer, intended audience and validity interval.
- Require proof of possession of the corresponding private key for sensitive requests; a copied public credential must not be sufficient.
- Keep the controller's human holder secret separate from agent processes. Delegation transfers only a bounded capability, never the controller's master secret.
- Treat agent software compromise as possible even when its key remains protected. Runtime policy must independently constrain tools and actions.
- Support key rotation, suspension and revocation. A lost or compromised agent key must not require publishing the human's identity.
- Do not claim that a valid credential proves the agent is safe, honest or competent.

Required tests: wrong agent key, substituted agent public key, wrong controller/delegator, expired agent credential, suspended issuer key, and use of a credential by a process without the bound private key.

## 7. Focus area: presentation correlation and verifier collusion

Selective disclosure reduces what a verifier learns in one presentation. It does not automatically make multiple presentations unlinkable.

Potential correlation channels include:

- stable subject IDs, credential IDs, public keys or globally reused pseudonyms;
- deterministic proof fields or repeated non-randomized presentation material;
- rare attribute combinations and exact timestamps;
- verifier-specific request IDs accidentally reused across domains;
- issuer issuance logs matched against presentation timing;
- shared verifier logs, IP addresses, TLS/session metadata and RPC records;
- public status queries or per-presentation on-chain events.

Required design rules:

1. Use randomized presentations whenever the selected credential scheme supports them.
2. Do not expose a global subject identifier or credential identifier to ordinary verifiers.
3. If a pseudonym is required for a narrowly scoped purpose, derive it with explicit domain separation over verifier identity and epoch; document that it is linkable within that scope.
4. Minimize requested attributes and avoid exact values when a predicate or coarser claim is sufficient.
5. Do not publish per-presentation events, holder-derived hashes or stable revocation handles on NEAR.
6. Define verifier data-retention and purpose restrictions; cryptography cannot prevent a verifier from recording what it legitimately sees.
7. Test collusion scenarios by comparing presentations and metadata available to two or more verifiers.

Acceptance test: independent verifiers should not be able to correlate presentations using protocol-visible identifiers alone. This is a future acceptance criterion, not a current ANONYMESH guarantee. Network-level correlation and issuer/verifier collusion may still remain possible and must be measured and documented.

## 8. Focus area: capability theft, delegation and confused deputy

A signed capability is an authorization statement, not a secret by itself. Theft of the delegate's private key, bearer token or capability-store access may still allow misuse.

Required design rules:

- Bind each capability to a delegate public key and require proof of possession for use.
- Bind the capability to exact audience, action, resource and canonical request digest.
- Include not-before, expiry, delegation depth and explicit limits where applicable.
- Require every child capability to be no broader than its parent across actions, resources, expiry, quotas and delegation depth.
- Treat quota as enforceable state, not descriptive metadata. Consume limits atomically before or as part of action authorization.
- Re-check authorization immediately before a tool/action executes; do not rely only on an earlier UI or proof result.
- Support emergency revocation and key rotation. If revocation state is unavailable or stale, fail closed for high-impact actions.
- Require explicit human approval for high-impact operations under local policy.

Required tests: stolen capability used with the wrong key; wrong audience/action/resource; modified parent digest; widened child scope; expired capability; replay; concurrent quota race; revoked delegate key; and a valid credential paired with an unauthorized action.

Current limitation: the repository contains a separate Node authorization-runtime prototype (`AgentAuthorizationRuntime`) that validates the chain, verifies delegate proof-of-possession, checks challenge/capability/action/resource binding, consumes replay state and quota, and gates a supplied callback. Its default store is in-memory; a SQLite store has a restart-persistence test. These components are not wired into the separate issuer-holder-verifier HTTP demo, do not provide a production tool sandbox or distributed authorization service, and have not been independently reviewed. The AnonCreds proof flow still does not prove possession of the capability or authorize the requested task by itself.

## 9. Privacy and cryptographic assumptions

- Reuse maintained, reviewed credential and proof libraries; do not invent cryptographic primitives.
- Pin exact versions and verify upstream advisories, platform support and reproducible builds.
- Use canonical serialization and domain separation for signed messages and action digests.
- Treat issuer keys, schema hashes, verifier artifacts and trusted setup material as security-critical configuration.
- Document what the selected credential scheme hides and what it reveals. Selective disclosure, predicate proofs, unlinkability and revocation are distinct properties.
- Do not claim post-quantum security unless the complete construction and dependencies have been reviewed for that property.
- Do not assume a public status root proves non-revocation. A verifier needs a valid witness or another specified proof mechanism.

The current Node demo uses AnonCreds CL credentials and presentations. The presentation request reveals `agent_role` and proves a hidden `valid_until` predicate; it does not request or prove `capability_scope`, and the `capabilityDigest` in the challenge is only checked against the verifier's in-memory challenge record. The separate Ed25519 capability runtime is not joined to this proof flow. Tested selective disclosure is not evidence of unlinkability, privacy-preserving revocation or resistance to colluding verifiers.

## 10. NEAR and off-chain privacy boundary

NEAR may store public issuer account/key metadata, key versions, schema or protocol hashes, governance configuration and batched status commitments.

Never put on-chain:

- human names, emails, phone numbers or raw credential claims;
- holder link secrets, agent private keys or recovery secrets;
- raw credential IDs or stable secret-derived hashes;
- proof witnesses, full presentations or per-presentation activity;
- capability bearer secrets or sensitive action details.

A chain observer can still correlate public account activity, issuer updates, transaction timing, RPC access patterns and status-root changes. Testnet transactions are public evidence of registry interaction, not evidence that a credential is anonymous or that an off-chain proof was verified on-chain.

## 11. Security controls and implementation status

| Control | Required release behavior | Current status |
|---|---|---|
| AnonCreds proof and selective disclosure | Verify proof against verifier-created request | Implemented in Node demo; Linux CI covers flow |
| Challenge binding and replay | Fresh context-bound challenge, durable atomic consume-once | AnonCreds demo ledger is in-memory and single-process; separate Node runtime offers memory and SQLite stores, with SQLite restart-persistence test; not a distributed service |
| Ed25519 authentication | Bind nonce, audience, task, capability digest and expiry | Prototype with tests; ordinary key-based authentication |
| Capability chain | Validate signatures, parent and attenuation | Tested Node/Rust verifier prototypes; separate Node authorization runtime checks proof-of-possession and consumes quota; not integrated into the AnonCreds HTTP demo or production tools |
| Unlinkability | Repeated-presentation and cross-verifier correlation evaluation | Not demonstrated |
| Privacy-preserving revocation | Prove current status without exposing stable holder identifier | Not implemented |
| Agent runtime policy | Deny by default; enforce before every tool/action | Not implemented |
| Transport and abuse protection | Authenticated endpoints, TLS, rate limits and monitoring | Local loopback harness only |
| NEAR registry | Validate issuer metadata/status and freshness in verifier | Contract scaffold and unit tests; not deployed or end-to-end integrated |
| Local-first secret custody | Encrypted storage, process isolation, key rotation and safe recovery | Not implemented as a production runtime |

## 12. Verification plan and acceptance criteria

Before claiming a control is complete, attach reproducible tests, the tested commit, environment and raw result.

### Identity and holder binding
- Credential with a substituted holder/agent key is rejected.
- A proof made by a different holder secret is rejected.
- Expired credentials and untrusted issuer keys are rejected.
- Controller delegation cannot disclose or transfer the controller's master secret.

### Correlation and collusion
- Generate repeated presentations for the same holder and compare proof-visible fields.
- Present to two independent verifier domains and inspect stable identifiers.
- Simulate two verifiers sharing logs and requested-attribute metadata.
- Test rare-attribute fingerprinting and timing/metadata leakage separately.
- Verify no holder-derived or per-presentation record is written to NEAR.

### Capability theft and policy
- A copied capability used without the delegate private key is rejected.
- Wrong audience, action, resource, request digest or parent digest is rejected.
- A child cannot widen parent permissions or limits.
- Expired, revoked and replayed capabilities are rejected.
- Concurrent requests cannot exceed a quota.
- A valid credential with an unauthorized action is denied by the runtime.

### Issuer, revocation and chain
- Unknown, suspended or stale issuer key versions fail closed.
- Status-root rollback or unavailable RPC is handled according to a documented fail-closed policy.
- No personal data or presentation activity appears in contract state/events.
- Testnet deployment and calls are verified by transaction reference and contract state, only after explicit user approval.

### Release evidence
Each test report must state repository commit, command, OS/architecture, dependency versions, expected result, actual result and artifact/hash where applicable. CI success is useful evidence but is not a substitute for an independent cryptographic or application-security review.

## 13. Residual risks and non-goals

Even after the planned controls are implemented, ANONYMESH cannot promise to hide:

- information a user voluntarily discloses;
- compromised endpoint contents or malware observing a holder device;
- IP addresses, timing, traffic volume or other network metadata without additional network privacy measures;
- rare disclosed attribute combinations;
- all issuer/verifier collusion or coercion;
- public chain metadata and timing;
- whether an agent is benevolent, competent or safe.

The prototype does not prove one-person-one-identity, universal Sybil resistance, production anonymity, unlinkability, privacy-preserving revocation, post-quantum security or production readiness.

## 14. Security decision and change policy

A threat is not considered mitigated merely because it appears in this document. Mark it mitigated only after an implementation exists and the corresponding positive, negative and adversarial tests pass on a recorded commit.

No custom cryptographic primitive, no public identity registry, no default remote proving, no public presentation log and no unsupported privacy/security claim.

No changes to `main`, merge, deployment, NEAR transaction, wallet/key import or hackathon submission are authorized by this threat model. Any external transaction or deployment requires a separate review of the exact network, signer, receiver, method, arguments, deposit, gas and expected state change, followed by explicit user approval.
