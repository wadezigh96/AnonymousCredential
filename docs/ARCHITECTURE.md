# ANONYMESH Architecture

This is the short implementation-facing architecture document. The longer protocol rationale is in [ANONYMESH_ARCHITECTURE.md](ANONYMESH_ARCHITECTURE.md).

## Runtime boundaries

```text
Issuer process  -- public schema/credential definition --> Holder (Agent A)
Holder          -- selective-disclosure presentation     --> Verifier (Agent B)
Verifier        -- read-only issuer/status metadata      --> NEAR registry adapter
```

The runnable vertical slice is the separate-process Node demo in `packages/anoncreds-agent-demo`:

- The issuer keeps the credential-definition private key in its own process.
- The holder keeps the link secret and credential material locally and creates presentations.
- The verifier owns the challenge ledger and verifies against the request stored in that ledger, not a request supplied by the presenter.
- A challenge is bound to audience, task, capability digest, nonce, and expiry. A valid proof consumes the nonce once; invalid proofs do not.

The Rust `crates/agent-auth` package is a separate Ed25519 proof-of-possession and signed-capability prototype. It is not currently wired into the Node demo or a production tool runtime. The NEAR contract is a public issuer/status metadata registry; it does not verify AnonCreds proofs and must not store personal claims, holder secrets, credential identifiers, or presentation events.

## Verification boundaries

Node integration tests cover issuer, holder, and verifier as separate operating-system processes. Rust tests cover the challenge transcript, replay guard, and attenuation checks. NEAR tests cover owner authorization, issuer key rotation, activation, and monotonic status roots. Android is a separate React Native smoke-test target and has not been run on a physical device in this environment.

## Explicit non-components

There is no production local-first agent runtime, durable distributed replay store, live capability enforcement before tool execution, privacy-preserving revocation witness flow, unlinkability evaluation, or testnet deployment in this repository state. These boundaries are intentional and are described in [SECURITY_LIMITATIONS.md](SECURITY_LIMITATIONS.md).
