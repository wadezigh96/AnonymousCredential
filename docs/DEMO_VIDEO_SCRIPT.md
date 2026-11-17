# ANONYMESH Demo Video Script

## Recording rules

Record only the local prototype and test evidence. Do not record seed phrases, private keys, credential-definition private material, link secrets, raw private subject values, or terminal environment variables. Do not create a NEAR account, deploy a contract, submit a transaction, or connect a wallet during this recording.

Use a clean terminal window and record the command plus the relevant output. The expected output below is based on the verified local run and must be treated as a target shape, not a substitute for rerunning the command.

## 1. Opening: objective

**Narration:**

> ANONYMESH demonstrates a private agent authorization prototype. An issuer creates an AnonCreds credential, a holder creates a selective-disclosure presentation, and a verifier checks the presentation against a fresh context-bound challenge. The demo also shows rejected proofs and replay protection.

State explicitly:

> This is a local prototype. It is not a production identity service, not a complete revocation system, and not an on-chain proof verifier.

## 2. Architecture

Show this simple diagram in a terminal or slide:

```text
Issuer
  │ credential issuance
  ▼
Agent A / Holder ── presentation + key proof ──► Agent B / Verifier
                                                   │
                                                   ▼
                                      challenge / policy checks
                                                   │
                                                   ▼
                                  accept once or reject and preserve nonce
```

**Narration:**

> The issuer, holder, and verifier are separate roles. The holder does not return its link secret or private subject. The verifier owns the request and challenge it uses for verification. The authorization-runtime capability prototype is shown separately because it is not yet connected to these HTTP role services.

## 3. Standalone proof smoke demo

Run:

```sh
npm run demo --prefix packages/anoncreds-agent-demo
```

Show output equivalent to:

```json
{
  "valid": true,
  "revealedRole": "weather_reader",
  "privateSubjectDisclosed": false,
  "proofBytes": 18400,
  "nonceBoundToContext": true
}
```

**Narration:**

> The proof is valid. The role is selectively revealed. The private subject is not disclosed, and the proof is bound to the expected context. This demonstrates selective disclosure and challenge binding; it does not demonstrate complete unlinkability.

## 4. Full local test suite

Run:

```sh
npm test --prefix packages/anoncreds-agent-demo
```

Show the final pass count from the fresh run. For the verified commit, the local result was **42 tests passed, 0 failed**.

**Narration:**

> The full suite includes credential issuance and presentation, hidden expiry predicates, proof tampering, nonce mismatch, expiry, replay, capability-chain checks, quota behavior, error classification, and process integration.

## 5. Separate-process issuer-holder-verifier demo

Run:

```sh
node --test packages/anoncreds-agent-demo/test/process-integration.test.mjs
```

**Narration:**

> This test starts issuer, holder, and verifier as separate operating-system processes. It checks readiness through the health endpoint, requires a real JSON `ready: true` response, submits a presentation for the wrong nonce, then submits the valid presentation and attempts replay. Child processes are terminated and awaited during cleanup.

Show the final result:

```text
1 test passed, 0 failed
```

## 6. Adversarial rejection

Point to or run the relevant tests:

```sh
npm test --prefix packages/anoncreds-agent-demo -- \
  --test-name-pattern='tampered|wrong nonce|replay|mismatch|expired|invalid Ed25519|untrusted root'
```

Explain each visible rejection:

- A presentation made for another nonce is rejected.
- A tampered AnonCreds presentation is rejected without consuming the original challenge.
- A replay after successful verification is rejected.
- Wrong audience, action, resource, root issuer, or delegate key is rejected.
- Expired challenges and credentials are rejected.
- Invalid Ed25519 proof-of-possession is rejected.

Do not imply that the AnonCreds proof alone authorizes a tool action. The capability runtime is a separate tested prototype.

## 7. Error and privacy explanation

**Narration:**

> The verifier distinguishes malformed or rejected proof material from configuration, native initialization, and unexpected internal errors. Public error results do not include credential contents or private subject data. The demo limits disclosure, but it does not guarantee anonymity: public keys, repeated sessions within an audience, disclosed attributes, timing, network metadata, and logs may still enable correlation.

Show the documented limitations, not raw credential JSON.

## 8. CI evidence

Show the GitHub Actions run pages:

- [AnonCreds integration](https://github.com/wadezigh96/anonymesh/actions/runs/43632229722)
- [Rust agent-auth](https://github.com/wadezigh96/anonymesh/actions/runs/43632313304)
- [NEAR issuer-registry](https://github.com/wadezigh96/anonymesh/actions/runs/43632319085)

**Narration:**

> The AnonCreds workflow passed its native demo and benchmark jobs. The Rust agent-auth workflow passed its locked tests. The NEAR contract workflow passed its locked unit tests and WASM build. These CI runs verify code and build artifacts; they do not mean that a contract was deployed.

## 9. NEAR explanation

**Narration:**

> NEAR is planned as a public metadata and status-commitment layer. The repository contains a preliminary issuer/status registry scaffold and CI verification, but no deployment or transaction has been made. The registry is not an on-chain AnonCreds verifier and must not receive holder secrets, private claims, link secrets, proof witnesses, or per-presentation activity.

If mentioning `gateway.near.ai`, say:

> NEAR AI Gateway is a separate private-AI trace application. ANONYMESH has no current integration with it or with the NEAR AI Cloud API.

## 10. Closing limitations

Read these points on camera:

1. Local loopback HTTP is not production transport security.
2. Durable distributed replay protection is not deployed.
3. Capability verification is not joined to the HTTP AnonCreds flow.
4. Revocation and privacy-preserving non-revocation are not implemented.
5. Complete unlinkability and verifier-collusion resistance are not demonstrated.
6. NEAR testnet deployment and transactions are intentionally out of scope for this recording.

**Closing narration:**

> ANONYMESH currently demonstrates a reproducible local cryptographic and authorization prototype with explicit security boundaries. The next engineering step is to integrate the registry and production controls without overstating the privacy or deployment guarantees.

## 11. Recording checklist

Before recording:

- confirm branch and commit;
- run `git status --short --branch`;
- run the standalone demo;
- run the full Node suite;
- run the process integration test;
- close terminals containing any secrets;
- verify no private key, seed phrase, credential witness, or raw private subject appears on screen;
- do not run deploy, wallet import, transaction, or testnet write commands.
