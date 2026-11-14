# ANONYMESH — Private Agentic Identity

ANONYMESH is a privacy-preserving identity and authorization protocol for **people and AI agents**.

**Current status:** ANONYMESH is a platform-independent protocol and agent-identity architecture. The main runnable issuer-holder-verifier integration demo is implemented as three separate local Node.js processes in `packages/anoncreds-agent-demo`. The verifier checks an AnonCreds proof before consuming a nonce; invalid proofs leave the challenge available, while a valid proof consumes it exactly once in the verifier process. Linux CI covers this process boundary. Revocation, unlinkability analysis and independent cryptographic review remain pending.

## Separate-process demo

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

## Security behavior

Nonce handling is synchronous in the verifier process: check pending/context/expiry, run native AnonCreds verification against the verifier-stored request, then mark consumed. A failed verification or thrown native error is rejected and does not consume the challenge. This in-memory ledger is single-process demo state; production requires durable, atomic storage (for example a transactional database with a compare-and-set/unique-consumption constraint), authentication, TLS and rate limits.

Agent A reveals only `agent_role`; the private subject and `valid_until` remain hidden, with validity enforced by an AnonCreds predicate. This is not a claim of absolute unlinkability or a full privacy-preserving revocation system.

## Reproduction and benchmarks

- `npm test --prefix packages/anoncreds-agent-demo`
- `npm run demo --prefix packages/anoncreds-agent-demo` (legacy single-process proof smoke test)
- `npm run benchmark --prefix packages/anoncreds-agent-demo`

The current local verification completed 22/22 Node tests on Linux x64, including the separate-process integration test. A 20-iteration Linux x64 benchmark reported proof-generation p50/p95 79.888/88.619 ms, verification p50/p95 77.318/119.527 ms, proof JSON p50/p95 18,119/18,142 bytes, and process RSS high-water 66.89 MiB. These measurements are host-specific, include native allocations, and are not Android/Bionic results or a benchmark of the user's phone.

Platform-specific smoke tests are documented separately from the protocol architecture. They validate selected library bindings on target devices and are not required to understand or run the platform-independent protocol demo.

## Other components

Delegated capability verification and the preliminary NEAR issuer/status registry remain prototypes. Unlinkable presentations, privacy-preserving revocation, human identity issuance, local-first agent runtime and production-grade rate limits are not complete. No testnet deployment, merge, or external submission is authorized by this work.


## Architecture overview

ANONYMESH is organized as a protocol with separate issuer, holder, verifier,
agent-authorization and registry boundaries. The current repository contains
working implementation slices, not a complete production protocol.

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

### Component status at a glance

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

For the implementation-facing boundaries, read [Architecture](docs/ARCHITECTURE.md). For the full protocol design, actors, credential lifecycle, trust boundaries, security controls, acceptance criteria and release gates, read [ANONYMESH Protocol Architecture](docs/ANONYMESH_ARCHITECTURE.md). The safe testnet procedure is in [TESTNET_DEMO.md](docs/TESTNET_DEMO.md), and unsupported security guarantees are listed in [SECURITY_LIMITATIONS.md](docs/SECURITY_LIMITATIONS.md).
