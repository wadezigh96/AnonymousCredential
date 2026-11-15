# ANONYMESH Security Limitations

This document separates verified demo behavior from guarantees the repository does not provide.

## Verified in the current branch

- The Node AnonCreds flow uses the official `@hyperledger/anoncreds-nodejs` 0.5.0 wrapper and native release installed by its package script.
- The Node suite covers selective disclosure, hidden expiry, tampering, nonce mismatch, challenge expiry, replay, separate issuer/holder/verifier processes, and replay denial after restarting the verifier with the same SQLite challenge and authorization databases.
- The Rust Ed25519 challenge-response prototype binds a challenge to nonce, audience, task, capability digest, and expiry, with a bounded in-memory replay set.
- The Node HTTP verifier wires `AgentAuthorizationRuntime` to a SQLite authorization store and a separate SQLite challenge ledger. It verifies a delegated capability chain, checks delegate-key proof-of-possession and challenge/action/resource binding, consumes replay state and quota, and returns an authorization decision. A process integration test proves a consumed challenge remains rejected after verifier restart with the same SQLite files. The standalone runtime still defaults to an in-memory store unless a persistent store is injected.
- The Node and Rust capability verifiers check signatures, parent digests, delegator continuity, exact audience/action/resource scope, expiry/quota attenuation, and maximum delegation depth.
- The NEAR contract stores issuer key metadata and monotonically increasing status commitments with owner-only mutation checks.

## Not provided

1. **Production transport security.** Issuer, holder and verifier run as separate OS processes in the integration test, but communicate over unauthenticated loopback HTTP. They do not provide authenticated service identity, TLS, request authentication, rate limiting, or abuse controls. Process separation is not equivalent to independent security domains.
2. **Durable replay protection.** The Node HTTP demo now persists challenge scope, resource, presentation request and consumed state in SQLite, and separately persists nonce/quota consumption in SQLite. CI restarts the verifier using the same files and confirms a previously consumed challenge is still denied. This is still a single-verifier-instance demo. Production multi-instance deployments need a shared transactional store, cross-process concurrency/recovery testing, retention/cleanup policy and operational backups.
3. **Capability integration and production enforcement.** The HTTP verifier now integrates AnonCreds verification, credential-to-key binding, Ed25519 proof-of-possession, signed capability verification and SQLite replay/quota consumption. The HTTP demo returns an authorization decision only; it does not call a real agent/tool host or execute external actions. The standalone runtime supports a guarded callback, but no production deny-by-default tool sandbox, distributed coordination, revocation or human-approval workflow is provided.
4. **Revocation.** The Node demo does not implement AnonCreds revocation or privacy-preserving non-revocation witnesses. The NEAR status root is an opaque public commitment and is not proof verification.
5. **Anonymity and unlinkability.** The tested AnonCreds presentation reveals `agent_role` and proves hidden `valid_until`; the private subject marker is absent from the tested proof JSON. The credential's `capability_scope` is not requested or proven, and the challenge's `capabilityDigest` is not cryptographically joined to the AnonCreds proof. Selective disclosure does not hide network metadata, timing, IP addresses, disclosed rare attributes, issuer/verifier collusion or application logs. No repeated-presentation unlinkability study is complete.
6. **Identity semantics.** The demo's `agent_subject` is a fixed sample marker and is not cryptographically bound to the agent's Ed25519 key or a human controller. The prototype does not prove one-human-one-identity, that an agent is benign, or that an issuer is honest. Issuer governance, key compromise recovery, and holder recovery remain design work.
7. **Platform coverage.** Linux x64 proof tests and a Linux x64 benchmark were run in CI. A native AnonCreds proof smoke test was reported successful on a physical Android device, but that is a single-process smoke test, not the separate-role protocol demo; Android ARM64 performance and full Android protocol integration remain unverified. Linux ARM64 results must not be presented as Android results.
8. **Blockchain deployment.** No NEAR transaction or deployment has been made. Testnet is not a production security guarantee and mainnet is out of scope.

## Release gate

Do not use production-security, anonymous-identity, unlinkability, revocation-complete, or mainnet-ready language until the missing controls have reproducible tests, independent review, and platform/deployment evidence. Keep all secrets, raw identity attributes, credential witnesses, private keys, and per-presentation activity out of public chain state and logs.
