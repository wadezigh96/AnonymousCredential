# ANONYMESH Security Limitations

This document separates verified demo behavior from guarantees the repository does not provide.

## Verified in the current branch

- The Node AnonCreds flow uses the official `@hyperledger/anoncreds-nodejs` 0.5.0 wrapper and native release installed by its package script.
- The Node suite covers selective disclosure, hidden expiry, tampering, nonce mismatch, challenge expiry, replay, and separate issuer/holder/verifier processes.
- The Rust Ed25519 challenge-response prototype binds a challenge to nonce, audience, task, capability digest, and expiry, with a bounded in-memory replay set.
- A separate Node `AgentAuthorizationRuntime` prototype verifies a delegated capability chain, checks delegate-key proof-of-possession and challenge/action/resource binding, consumes replay state and quota, and gates an action callback. Its default store is in-memory; an optional SQLite store has a test showing replay/quota state survives reopening.
- The Node and Rust capability verifiers check signatures, parent digests, delegator continuity, exact audience/action/resource scope, expiry/quota attenuation, and maximum delegation depth.
- The NEAR contract stores issuer key metadata and monotonically increasing status commitments with owner-only mutation checks.

## Not provided

1. **Production transport security.** Issuer, holder and verifier run as separate OS processes in the integration test, but communicate over unauthenticated loopback HTTP. They do not provide authenticated service identity, TLS, request authentication, rate limiting, or abuse controls. Process separation is not equivalent to independent security domains.
2. **Durable replay protection.** Challenge and replay state is in memory. Process restart, multiple verifier instances, or a non-atomic external store can permit replay unless production storage uses a transactional consume-once invariant.
3. **Capability integration and production enforcement.** A separate Node authorization-runtime prototype performs capability verification, delegate proof-of-possession, challenge binding, replay/quota consumption and guarded callback execution in tests. It is not integrated into the issuer-holder-verifier HTTP processes or a real agent/tool host. The default store is in-memory; SQLite persistence is tested as a store component, not as a deployed multi-instance authorization service. No production deny-by-default tool sandbox, distributed coordination, revocation or human-approval workflow is provided.
4. **Revocation.** The Node demo does not implement AnonCreds revocation or privacy-preserving non-revocation witnesses. The NEAR status root is an opaque public commitment and is not proof verification.
5. **Anonymity and unlinkability.** The tested AnonCreds presentation reveals `agent_role` and proves hidden `valid_until`; the private subject marker is absent from the tested proof JSON. The credential's `capability_scope` is not requested or proven, and the challenge's `capabilityDigest` is not cryptographically joined to the AnonCreds proof. Selective disclosure does not hide network metadata, timing, IP addresses, disclosed rare attributes, issuer/verifier collusion or application logs. No repeated-presentation unlinkability study is complete.
6. **Identity semantics.** The demo's `agent_subject` is a fixed sample marker and is not cryptographically bound to the agent's Ed25519 key or a human controller. The prototype does not prove one-human-one-identity, that an agent is benign, or that an issuer is honest. Issuer governance, key compromise recovery, and holder recovery remain design work.
7. **Platform coverage.** Linux x64 proof tests and a Linux x64 benchmark were run in the current environment. Android physical-device execution and Android ARM64 performance remain unverified. Linux ARM64 results must not be presented as Android results.
8. **Blockchain deployment.** No NEAR transaction or deployment has been made. Testnet is not a production security guarantee and mainnet is out of scope.

## Release gate

Do not use production-security, anonymous-identity, unlinkability, revocation-complete, or mainnet-ready language until the missing controls have reproducible tests, independent review, and platform/deployment evidence. Keep all secrets, raw identity attributes, credential witnesses, private keys, and per-presentation activity out of public chain state and logs.
