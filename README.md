# ANONYMESH — Private Agentic Identity

ANONYMESH is a privacy-preserving identity and authorization protocol for **people and AI agents**.

**Current status:** the official AnonCreds native release powers the issuer-holder-verifier demo. The roles now run as three separate local HTTP processes. The verifier verifies the AnonCreds proof before consuming a nonce; invalid proofs leave the challenge available, while a valid proof consumes it exactly once in the verifier process. Linux CI covers this process boundary. Android/Bionic, revocation, unlinkability analysis and independent cryptographic review remain pending.

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

The earlier 7/7 proof tests passed on Linux x64. A Linux ARM64 benchmark also completed 20 measured iterations (proof generation p50/p95 68.314/68.429 ms; verification p50/p95 66.877/66.973 ms; proof JSON p50/p95 18,114/18,158 bytes; process RSS high-water 61.67 MiB). Those measurements are Linux ARM64, not Android/Bionic and not a benchmark of the user's phone.

See [docs/ANONYMESH_ANDROID_VALIDATION.md](docs/ANONYMESH_ANDROID_VALIDATION.md) for Android acceptance criteria. The official Node.js wrapper's Linux binary is not assumed to work on Android/Bionic; the intended Android route is the official React Native wrapper.

## Other components

Delegated capability verification and the preliminary NEAR issuer/status registry remain prototypes. Unlinkable presentations, privacy-preserving revocation, human identity issuance, local-first agent runtime and production-grade rate limits are not complete. No testnet deployment, merge, or external submission is authorized by this work.
