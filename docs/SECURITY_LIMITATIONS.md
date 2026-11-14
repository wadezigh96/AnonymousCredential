# ANONYMESH Security Limitations

This document separates verified demo behavior from guarantees the repository does not provide.

## Verified in the current branch

- The Node AnonCreds flow uses the official `@hyperledger/anoncreds-nodejs` 0.5.0 wrapper and native release installed by its package script.
- The Node suite covers selective disclosure, hidden expiry, tampering, nonce mismatch, challenge expiry, replay, and separate issuer/holder/verifier processes.
- The Ed25519 prototype binds a challenge to nonce, audience, task, capability digest, and expiry, with a bounded in-memory replay set.
- The capability verifier checks signatures, parent digests, delegator continuity, exact audience/action/resource scope, expiry attenuation, quota attenuation, and maximum depth.
- The NEAR contract stores issuer key metadata and monotonically increasing status commitments with owner-only mutation checks.

## Not provided

1. **Production transport security.** The role servers are a loopback test harness. They do not provide authenticated service identity, TLS, request authentication, authorization middleware, rate limiting, or abuse controls.
2. **Durable replay protection.** Challenge and replay state is in memory. Process restart, multiple verifier instances, or a non-atomic external store can permit replay unless production storage uses a transactional consume-once invariant.
3. **Capability execution enforcement.** The signed capability chain is a verifier prototype. Quota is metadata and is not atomically consumed before a tool or financial action. No live deny-by-default agent runtime is wired to it.
4. **Revocation.** The Node demo does not implement AnonCreds revocation or privacy-preserving non-revocation witnesses. The NEAR status root is an opaque public commitment and is not proof verification.
5. **Anonymity and unlinkability.** Selective disclosure hides the private subject in the tested proof JSON, but it does not hide network metadata, timing, IP addresses, disclosed rare attributes, issuer/verifier collusion, or application logs. No repeated-presentation unlinkability study is complete.
6. **Identity semantics.** The prototype does not prove one-human-one-identity, that an agent is benign, or that an issuer is honest. Issuer governance, key compromise recovery, and holder recovery remain design work.
7. **Platform coverage.** Linux x64 proof tests and a Linux x64 benchmark were run in the current environment. Android physical-device execution and Android ARM64 performance remain unverified. Linux ARM64 results must not be presented as Android results.
8. **Blockchain deployment.** No NEAR transaction or deployment has been made. Testnet is not a production security guarantee and mainnet is out of scope.

## Release gate

Do not use production-security, anonymous-identity, unlinkability, revocation-complete, or mainnet-ready language until the missing controls have reproducible tests, independent review, and platform/deployment evidence. Keep all secrets, raw identity attributes, credential witnesses, private keys, and per-presentation activity out of public chain state and logs.
