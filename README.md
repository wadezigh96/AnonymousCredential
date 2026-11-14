# ANONYMESH — Private Agentic Identity Infrastructure (PAII)

**ANONYMESH** is a platform-independent protocol project exploring **Private Agentic Identity Infrastructure (PAII)**: privacy-preserving identity, trust and authorization for humans and autonomous AI agents.

**PAII is the innovation category proposed by this project**, not a claim that it is already an established industry standard or an official NEAR Hackathon track. ANONYMESH is the protocol and reference implementation being developed to explore this category.

The central idea is simple: **an agent should be able to prove that it is authorized to perform an action without unnecessarily revealing its private identity or its entire credential.**

## What is Private Agentic Identity Infrastructure?

PAII describes the infrastructure layer that allows people and AI agents to establish and prove trust, present limited credentials, delegate bounded authority and obtain authorization while minimizing disclosure of private information.

It is broader than a login mechanism or a standalone zero-knowledge proof. It brings together credential-based identity, privacy-preserving presentations, agent authentication, delegated capabilities, policy enforcement and trust coordination.

### Five innovation pillars

| Pillar | Purpose | ANONYMESH direction |
|---|---|---|
| **Private Identity** | Prove selected identity attributes without disclosing the full identity | Anonymous Credentials, selective disclosure and ZK proof systems |
| **Private Trust** | Let another agent verify relevant trust claims with limited disclosure | Verifiable credentials and future privacy-preserving reputation research |
| **Delegated Authority** | Allow an agent to delegate narrowly scoped permissions | Signed capability chains, attenuation and policy checks |
| **Private Agent Governance** | Control validity, revocation, replay and permitted actions | Revocation research, challenge binding, anti-replay and policy enforcement |
| **Agent Interoperability** | Let independently operated agents verify claims across system boundaries | Issuer–Holder–Verifier protocol and future NEAR registry integration |

These pillars are the project's design taxonomy and roadmap. They are not all implemented today; implementation status and limitations are listed below.

## Design principles

1. **Privacy by minimization:** disclose only the attributes needed for a verification decision.
2. **Verifiable authorization:** a valid identity proof alone must not be confused with permission to perform a requested action.
3. **Bounded delegation:** delegated authority should be limited by audience, action, resource, expiry and other applicable policy constraints.
4. **Separation of roles:** issuer, holder and verifier should have distinct responsibilities and, for stronger deployments, separate security domains.
5. **Honest security claims:** distinguish demonstrated properties from prototypes, planned work and unresolved risks.
6. **Platform independence:** the protocol is not tied to Android, a particular operating system or one agent framework.

## Protocol architecture

The core protocol uses three roles:

- **Issuer** creates schemas, credential definitions and credentials under an issuer policy.
- **Holder (Agent A)** protects its link secret and creates presentations that disclose only requested claims or prove predicates.
- **Verifier (Agent B)** issues a context-bound challenge and verifies a presentation against the request it originally created.

The intended authorization flow is:

1. An agent receives a credential from an issuer.
2. A relying agent requests proof of a specific claim or predicate, bound to its audience and a fresh challenge.
3. The holder creates a selective-disclosure proof.
4. The verifier validates the proof and the request context.
5. A separate authorization policy evaluates whether the verified claims and delegated capabilities permit the requested action.
6. The action is allowed only if all required checks pass.

A credential proof is **not by itself proof that a particular action is authorized**. The authorization and policy-enforcement layer is a distinct part of the design and remains under development.

## Target secure authorization flow (integration in progress)

The intended end-to-end flow connects anonymous credentials to agent-key possession and delegated authorization. This is the security design being implemented; **it is not yet an integrated or production-ready flow**.

```text
Issuer
  |  issues a credential bound to the agent's public key
  v
Agent A — Holder
  |  AnonCreds presentation
  |  + Ed25519 proof of possession
  |  + delegated capability chain
  v
Agent B — Verifier
  |  checks credential proof, agent public-key binding,
  |  capability chain and fresh challenge
  v
Authorization Runtime
  |  checks audience, task, resource, expiry, replay,
  |  delegation limits and quota
  v
VALID -> permit the requested action
REJECTED -> deny the action
```

### What each step must prove

1. **Issuer:** issues a credential whose agent-key binding is covered by the credential signature. The credential must not merely contain an unverified display name or free-form subject marker.
2. **Agent A — Holder:** creates an AnonCreds proof for the minimum required claims, proves possession of the private key corresponding to the credential-bound public key, and presents the delegated capability chain. The holder's link secret and private identity attributes remain local.
3. **Agent B — Verifier:** verifies the AnonCreds presentation against its own request, checks that the public key disclosed/proven by the credential is the same key used for Ed25519 proof-of-possession and the capability delegate, and validates the challenge's audience, task and freshness.
4. **Authorization Runtime:** independently enforces capability scope, resource, expiry, delegation attenuation, replay protection and quota immediately before the action. A valid credential alone must never authorize an action.
5. **Decision:** return only the minimum decision information needed by the relying agent. Deny by default if any required proof, trust state or policy check fails.

### Pairwise keys and correlation limits

The design uses a **different agent key for each verifier audience** where the deployment supports it. This reduces the ability to correlate an agent across different verifier domains because the public key shown to one audience is not reused with another.

This does **not** guarantee complete unlinkability:

- The same pairwise public key can link multiple sessions within the same audience.
- Disclosed attributes, timestamps, network metadata, issuer records and verifier logs may still enable correlation.
- Colluding verifiers may combine information they independently observe.

ANONYMESH therefore does not claim full unlinkability or resistance to all verifier collusion. Pairwise keys are a correlation-reduction measure, not a substitute for randomized presentations, disclosure minimization, metadata protections and empirical cross-verifier privacy testing.

### Implementation status of this flow

The AnonCreds issuer-holder-verifier demo and the Ed25519 capability/authorization-runtime prototypes currently exist as separate implementation slices. The credential-to-agent-key binding and the complete proof-to-capability-to-action integration described above remain **in progress / not yet demonstrated end-to-end**. The diagram describes the target protocol behavior, not a completed testnet feature.

## Current implementation status

ANONYMESH is a platform-independent protocol and agent-identity architecture. The main runnable issuer-holder-verifier integration demo is implemented as three separate local Node.js processes in `packages/anoncreds-agent-demo`. The verifier checks an AnonCreds proof before consuming a nonce; invalid proofs leave the challenge available, while a valid proof consumes it exactly once in the verifier process. Linux CI covers this process boundary. Revocation, unlinkability analysis and independent cryptographic review remain pending.

### Separate-process demo

The demo package provides three processes:

- **Issuer** creates the schema, credential definition and offer, and retains the credential-definition private key in its own process memory.
- **Holder (Agent A)** creates and retains its link secret, creates the blinded credential request, processes the issued credential and generates selective-disclosure presentations.
- **Verifier (Agent B)** owns the challenge ledger, retains the original presentation request, verifies the proof against that request, and consumes the nonce only after successful verification.

All role servers bind to loopback by default. The HTTP endpoints are a local integration harness, not an authenticated production network protocol. The issuer and verifier share only public schema/credential-definition data. The holder's link secret and private subject are not returned by its endpoints.

Start each role in its own terminal, using the same package directory:

```sh
npm run start:issuer --prefix packages/anoncreds-agent-demo
ISSUER_URL=http://127.0.0.1:4311 npm run start:holder --prefix packages/anoncreds-agent-demo
ISSUER_URL=http://127.0.0.1:4311 npm run start:verifier --prefix packages/anoncreds-agent-demo
```

For a reproducible full flow, run `npm test --prefix packages/anoncreds-agent-demo`. The integration test launches the three roles as separate operating-system processes, enrolls Agent A, requests a challenge from Agent B, submits a tampered proof first, then submits the authentic proof and finally replays it. Expected results: tampered proof rejected without consuming the challenge; authentic proof accepted once; replay rejected.

### Security behavior and limitations

Nonce handling is synchronous in the verifier process: check pending/context/expiry, run native AnonCreds verification against the verifier-stored request, then mark consumed. A failed verification or thrown native error is rejected and does not consume the challenge. This in-memory ledger is single-process demo state; production requires durable, atomic storage (for example a transactional database with a compare-and-set/unique-consumption constraint), authentication, TLS and rate limits.

Agent A reveals only `agent_role`; the private subject and `valid_until` remain hidden, with validity enforced by an AnonCreds predicate. This is not a claim of absolute unlinkability or a full privacy-preserving revocation system.

### Reproduction and benchmarks

- `npm test --prefix packages/anoncreds-agent-demo`
- `npm run demo --prefix packages/anoncreds-agent-demo` (legacy single-process proof smoke test)
- `npm run benchmark --prefix packages/anoncreds-agent-demo`

The verified feature branch completed 42/42 Node tests on Linux x64, including the separate-process integration test. The standalone smoke demo reported `valid: true`, `privateSubjectDisclosed: false`, and `nonceBoundToContext: true`. A 20-iteration Linux x64 benchmark reported proof-generation p50/p95 79.888/88.619 ms, verification p50/p95 77.318/119.527 ms, proof JSON p50/p95 18,119/18,142 bytes, and process RSS high-water 66.89 MiB. These measurements are host-specific, include native allocations, and are not Android/Bionic results or a benchmark of the user's phone.

Platform-specific smoke tests are documented separately from the protocol architecture. They validate selected library bindings on target devices and are not required to understand or run the platform-independent protocol demo.

## Roadmap

The following roadmap defines the intended development direction. A roadmap item is not a claim of completion.

1. **Private Agent Identity:** strengthen credential issuance, holder protection and selective-disclosure verification.
2. **Private Agent Authorization:** bind proof requests to audience, task and fresh challenges; integrate capability verification with actual policy decisions.
3. **Private Agent Trust:** research privacy-preserving reputation and cross-agent trust verification without introducing unnecessary correlation.
4. **Private Agent Governance:** develop privacy-aware revocation, durable anti-replay, rate limits and enforceable policy controls.
5. **Private Agent Economy:** enable interoperable verification and bounded delegation between independently operated agents, with NEAR used where on-chain coordination adds value.

## NEAR integration

NEAR is a planned coordination and public-registry layer for information such as issuer metadata and status commitments. Private identity attributes, holder secrets and private credential contents should not be placed on-chain. The current NEAR issuer/status registry is a preliminary contract scaffold; it is not deployed and does not yet provide end-to-end on-chain revocation verification.

## Other components and status at a glance

Delegated capability verification and the preliminary NEAR issuer/status registry remain prototypes. Unlinkable presentations, privacy-preserving revocation, human identity issuance, local-first agent runtime and production-grade rate limits are not complete. No testnet deployment, merge, or external submission is authorized by this work.

| Component | Current status |
|---|---|
| AnonCreds issuer-holder-verifier demo | Implemented as separate local Node processes; Linux CI tests pass |
| Selective disclosure / hidden expiry predicate | Implemented and exercised in the Node.js demo |
| Ed25519 challenge-response | Prototype with CI tests; ordinary key-based authentication, not anonymous |
| Delegated capability chain | Prototype verifier with CI tests; not yet enforced by a live agent runtime |
| NEAR issuer/status registry | Preliminary contract scaffold with unit tests; not deployed |
| Unlinkable presentations | Not demonstrated |
| Privacy-preserving revocation | Not implemented |
| Local-first agent runtime and durable wallet | Not implemented |
| Production rate limits and distributed replay protection | Not implemented |

## Architecture overview

ANONYMESH is organized as a protocol with separate issuer, holder, verifier, agent-authorization and registry boundaries. The current repository contains working implementation slices, not a complete production protocol.

```text
Human / Agent
     |
     v
Holder (Agent A) ---- presentation + proof ----> Verifier (Agent B)
     |                                           |
     | credential request                       | challenge + verification
     v                                           v
Issuer process                              Replay / policy checks
                                                 |
                                                 v
                                      NEAR issuer/status registry
                                      (public issuer metadata only)

Platform-independent protocol flow: issuer, holder and verifier.
Current runnable integration demo: separate Node.js role processes.
Production agent runtime: not yet implemented.
```

### Repository structure

```text
anonymesh/
├── packages/
│   └── anoncreds-agent-demo/    # Node issuer, holder and verifier processes
│       ├── src/roles/            # issuer.mjs, holder.mjs, verifier.mjs, HTTP helpers
│       ├── src/                  # demo entrypoint and benchmark
│       └── test/                 # proof flow and separate-process integration tests
├── crates/
│   └── agent-auth/              # Ed25519 challenge-response and delegated-capability prototypes
├── contracts/
│   └── near/issuer-registry/    # NEAR issuer/status registry scaffold and unit tests
├── docs/
│   ├── ARCHITECTURE.md
│   ├── ANONYMESH_ARCHITECTURE.md
│   ├── CRYPTO_SELECTION.md
│   ├── THREAT_MODEL.md
│   ├── AUDIT.md
│   ├── HACKATHON_MVP.md
│   ├── TESTNET_DEMO.md
│   ├── SECURITY_LIMITATIONS.md
│   └── ANONYMESH_ANDROID_VALIDATION.md
└── .github/workflows/           # CI for protocol components and platform-specific validation
```

For implementation-facing boundaries, read [Architecture](docs/ARCHITECTURE.md). For the full protocol design, actors, credential lifecycle, trust boundaries, security controls, acceptance criteria and release gates, read [ANONYMESH Protocol Architecture](docs/ANONYMESH_ARCHITECTURE.md). The safe testnet procedure is in [TESTNET_DEMO.md](docs/TESTNET_DEMO.md), and unsupported security guarantees are listed in [SECURITY_LIMITATIONS.md](docs/SECURITY_LIMITATIONS.md).
