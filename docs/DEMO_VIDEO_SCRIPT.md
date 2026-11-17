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

> The issuer, holder, and verifier are separate roles. The holder does not return its link secret or private subject. The verifier validates the presentation, issuer-key binding, Ed25519 proof-of-possession, signed capability, challenge, replay state and quota in one local authorization path. This is a prototype decision gate, not a production tool host.

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

Show the final pass count from the fresh run and include the exact commit SHA in the recording. Do not reuse the historical **42 tests passed** count as current evidence; report only the output produced by the commit being demonstrated. The PR #2 CI evidence is linked in the current [project status](PROJECT_STATUS.md).

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

- PR #2 agent authentication: [run 44117993558](https://github.com/wadezigh96/anonymesh/actions/runs/44117993558)
- PR #2 NEAR wallet bridge: [run 44117993403](https://github.com/wadezigh96/anonymesh/actions/runs/44117993403)
- PR #2 Linux ARM64 benchmark: [run 44117993371](https://github.com/wadezigh96/anonymesh/actions/runs/44117993371)
- PR #2 NEAR contract/WASM: [run 44117993350](https://github.com/wadezigh96/anonymesh/actions/runs/44117993350)
- PR #2 AnonCreds process integration: [run 44117993347](https://github.com/wadezigh96/anonymesh/actions/runs/44117993347)
- Historical seven-workflow baseline: see [PROJECT_STATUS.md](PROJECT_STATUS.md).

**Narration:**

> Five workflows passed on PR #2 head `774bbba1e8ef30ff2e0b0bcc1a3cb66474f22ece`. The AnonCreds integration workflow and Android workflow did not run on that pull request. The merge commit must receive complete CI coverage on `main`. Workflow success proves only the jobs and commit shown; it does not prove live issuer registration, verifier acceptance or production readiness.

## 9. NEAR explanation

**Narration:**

> NEAR is the public issuer-metadata and status-commitment layer. The registry contract is deployed and initialized on Testnet at `registry.wkams.testnet`, with owner `wkams.testnet`; the deployment transaction and `get_owner()` read-back are recorded in `docs/NEAR_TESTNET_DEPLOYMENT_2026-11-16.md`. Issuer registration for `issuer.testnet` and live verifier acceptance remain pending. The registry is not an on-chain AnonCreds verifier and must never receive holder secrets, private claims, link secrets, proof witnesses, or per-presentation activity.

If mentioning `gateway.near.ai`, say:

> NEAR AI Gateway is a separate private-AI trace application. ANONYMESH has no current integration with it or with the NEAR AI Cloud API.

## 10. Closing limitations

Read these points on camera:

1. Local loopback HTTP is not production transport security.
2. Durable distributed replay protection is not deployed.
3. The integrated verifier returns an authorization decision; it does not execute a real external tool or payment.
4. Revocation and privacy-preserving non-revocation are not implemented.
5. Complete unlinkability and verifier-collusion resistance are not demonstrated.
6. The NEAR Testnet deployment already exists, but issuer registration and live verifier acceptance are pending. Do not submit any further transaction during this recording.

**Closing narration:**

> ANONYMESH currently demonstrates a reproducible local cryptographic and authorization prototype with explicit security boundaries. The next engineering step is to integrate the registry and production controls without overstating the privacy or deployment guarantees.

## 11. Recording checklist

Before recording:

- confirm branch is `main` and record the exact commit SHA;
- run `git status --short --branch`;
- run the standalone demo;
- run the full Node suite;
- run the process integration test;
- close terminals containing any secrets;
- verify no private key, seed phrase, credential witness, or raw private subject appears on screen;
- do not run deploy, wallet import, transaction, or testnet write commands.
