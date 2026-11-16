# ANONYMESH Demo Readiness

**Repository:** `wadezigh96/anonymesh`
**Branch:** `feat/anonymesh-private-agent-identity`
**Verified commit:** `f407c9d8767addda2c0647a0ab634964bc876eaa`

## Current readiness result

The repository is ready for a **local three-role demo and demo-video recording**. The cryptographic prototype is not ready for production deployment, and no NEAR testnet deployment or transaction has been performed.

The following evidence is current for the verified commit:

- Local Node suite: **42/42 tests passed**.
- Local adversarial subset: **21/21 tests passed**.
- Local PAAI verifier tests: **9/9 tests passed**.
- Local process integration: **1/1 test passed**.
- Standalone demo: exited successfully with `valid: true`, `privateSubjectDisclosed: false`, and `nonceBoundToContext: true`.
- GitHub Actions AnonCreds integration: [run 43632229722](https://github.com/wadezigh96/anonymesh/actions/runs/43632229722), **success**.
- GitHub Actions Rust agent-auth: [run 43632313304](https://github.com/wadezigh96/anonymesh/actions/runs/43632313304), **success**.
- GitHub Actions NEAR issuer-registry: [run 43632319085](https://github.com/wadezigh96/anonymesh/actions/runs/43632319085), **success**, including unit tests and WASM build.
- No secret-like additions were found in the audited diff. No issuer, holder, or verifier child process remained after integration testing.

## What is implemented and tested

The local Node package implements an issuer, holder, and verifier flow using the official `@hyperledger/anoncreds-nodejs` wrapper. The standalone smoke demo proves a selected role and a hidden subject property without returning the private subject marker. The separate-process integration test starts issuer, holder, and verifier as local operating-system processes.

The verifier stores the presentation request associated with a challenge and checks the presentation against that request. A proof made for another nonce is rejected. A tampered proof is rejected without consuming the challenge. A valid proof is accepted once, and replay is rejected. The verifier health check requires an HTTP success response with a JSON `ready: true` payload before considering a role ready.

The Node HTTP verifier integrates signed capability-chain validation, key-bound Ed25519 proof-of-possession, audience/action/resource binding, expiry, replay, quota, and the AnonCreds presentation path. The guarded action callback remains a separate runtime API and is not a production tool host.

The Rust agent-auth prototype and the NEAR issuer/status registry scaffold are verified by GitHub Actions. The NEAR workflow builds the contract to WASM and runs unit tests. These checks do not deploy the contract or submit a transaction.

## What remains prototype or planned

The following claims must not be made during a demo:

- The HTTP role servers use bearer authentication and endpoint/authentication-failure rate limits for the demo, but use loopback HTTP without TLS or distributed service identity.
- The HTTP verifier persists challenge and authorization state in local SQLite files; this is same-host evidence, not a distributed database guarantee.
- The AnonCreds presentation reveals the issuer registry key and agent key, while capability and challenge binding are checked by the verifier path; the capability digest is not itself a selectively disclosed AnonCreds attribute.
- AnonCreds revocation and privacy-preserving non-revocation witnesses are not implemented.
- Selective disclosure is not the same as complete anonymity or unlinkability. Public keys, disclosed attributes, timing, network metadata, issuer records, verifier logs, and colluding verifiers can still create correlation.
- The sample `agent_subject` is not a human identity binding and does not prove that an agent is benign or controlled by one person.
- The NEAR registry stores public issuer metadata and opaque status commitments. It is not an on-chain AnonCreds verifier or a privacy-preserving revocation system.
- There is no current ANONYMESH integration with `gateway.near.ai` or the NEAR AI Cloud API. The public Gateway site describes a macOS private-AI trace application; it is not evidence of blockchain or identity integration.

## Local demo checklist

Run from the repository root:

```sh
npm install --prefix packages/anoncreds-agent-demo --no-audit --no-fund
npm test --prefix packages/anoncreds-agent-demo
npm run demo --prefix packages/anoncreds-agent-demo
```

Expected standalone output has this shape:

```json
{
  "valid": true,
  "revealedRole": "weather_reader",
  "privateSubjectDisclosed": false,
  "proofBytes": 18400,
  "nonceBoundToContext": true
}
```

For the separate-process flow, use:

```sh
node --test packages/anoncreds-agent-demo/test/process-integration.test.mjs
```

The test demonstrates issuer, holder, verifier, invalid proof, valid proof, replay rejection, health readiness, and child-process cleanup. It does not perform a blockchain action.

## Security demo sequence

A recording should show the following order:

1. Run the standalone smoke demo and show `valid: true`.
2. Run the full Node test suite and show the final pass count.
3. Run the process integration test and explain the issuer-holder-verifier boundaries.
4. Point to the tampered-proof test and show that the first invalid attempt does not burn the nonce.
5. Point to the replay test and show that the authentic proof is accepted once only.
6. Point to the capability-runtime tests separately and state clearly that they are not wired into the HTTP role demo.
7. End with the limitations: no production transport, no revocation witness, no unlinkability guarantee, no NEAR deployment, and no transaction.

## NEAR testnet readiness checklist

Before a future testnet run, the operator must provide or create a disposable `.testnet` account and obtain testnet funds through an official faucet. The account and signer must be isolated from mainnet credentials. The operator must choose an RPC endpoint and verify its current limits and availability.

The current repository still needs the following implementation work before a meaningful on-chain demo:

- deployment configuration for the issuer/status registry;
- an explicit contract account and deployer account policy;
- RPC configuration and health/fail-closed behavior;
- a defined public metadata payload and versioning policy;
- read-path integration from verifier to the registry, if registry state is required for authorization;
- transaction receipts and contract-state verification;
- tests for stale or unavailable registry state;
- a documented rollback or disable plan.

No account creation, key import, contract deployment, registry update, or transaction is part of this readiness work.

## Official references

- [NEAR Networks](https://docs.near.org/protocol/network/networks) — network separation and testnet RPC/status references.
- [Create an Account](https://docs.near.org/getting-started/create-account) — `.testnet` accounts, faucet funding, and key handling.
- [NEAR RPC Providers](https://docs.near.org/api/rpc/providers) — testnet RPC provider options and JSON-RPC behavior.
- [NEAR AI Cloud API](https://cloud-api.near.ai/docs) — separate API authentication and endpoint documentation.
- [NEAR AI Gateway](https://gateway.near.ai/) — macOS private-AI trace gateway; not an ANONYMESH integration.
