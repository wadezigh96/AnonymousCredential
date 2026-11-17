# ANONYMESH — NEAR Hackathon Technical Scope

**Project:** ANONYMESH — Private Agentic Identity Infrastructure (PAII)  
**Network target:** NEAR Testnet for public issuer metadata only  
**Status date:** 2026-11-17  
**Canonical status:** [PROJECT_STATUS.md](PROJECT_STATUS.md)

## 1. Project proposition

ANONYMESH explores Private Agentic Identity Infrastructure: an agent proves relevant credential claims and bounded authority to another agent while minimizing disclosure of private identity data.

PAII is the project's proposed category and design taxonomy, not a claim that it is an established industry standard or an official hackathon track.

## 2. Architecture

```text
Issuer
  -> AnonCreds credential issuance (off-chain)
Holder / Agent A
  -> local link secret and selective-disclosure presentation
Verifier / Agent B
  -> validates original request, proof, challenge and key possession
NEAR issuer registry
  -> public issuer key/version/schema/status metadata only
Authorization gate
  -> audience + action + resource + expiry + capability + replay + quota
Decision
  -> ALLOW or DENY (default deny)
```

NEAR is a public trust/status coordination layer. It is not the credential issuer, holder wallet, AnonCreds verifier, private data store, privacy-preserving revocation proof system or payment rail.

## 3. What the repository demonstrates

- Three separate local Node.js processes for Issuer, Holder and Verifier.
- AnonCreds CL credential issuance and selective-disclosure presentation with a hidden predicate.
- Ed25519 proof-of-possession and signed delegated-capability checks in the local verifier path.
- Challenge binding, replay denial and SQLite persistence/concurrency evidence on a single host.
- Rust NEAR issuer registry source and a read-only RPC adapter.
- Registry-required verifier mode that rejects unknown, malformed or unavailable registry state in deterministic mock-RPC tests.
- GitHub Actions evidence includes a seven-workflow baseline on commit `abaed695535f6da1c465f0e3291a4989175fb7ba` and five successful workflows on PR #2 head `774bbba1e8ef30ff2e0b0bcc1a3cb66474f22ece`. The AnonCreds integration and Android workflows did not run on PR #2; see [PROJECT_STATUS.md](PROJECT_STATUS.md) for exact run IDs and remaining CI coverage.

## 4. What is not claimed

- NEAR Testnet contract deployment and owner initialization are complete at `registry.wkams.testnet` (owner `wkams.testnet`); issuer registration and live verifier acceptance are not yet evidenced.
- No on-chain AnonCreds/ZK proof verification.
- No privacy-preserving revocation/non-revocation witness.
- No complete unlinkability or verifier-collusion resistance.
- No proof of one-human-one-identity or human credential issuance.
- No production multi-host replay/quota service, authenticated transport, external tool host or payment execution.
- No mainnet deployment or private-chain deployment.

## 5. Testnet data and privacy rules

The registry may contain only public issuer metadata: issuer account, Ed25519 public key, key version, schema hash, active flag, status epoch and opaque status root.

Never write holder names, emails, phone numbers, raw claims, credential IDs, link secrets, proof witnesses, private keys, recovery phrases or per-presentation activity to public chain state, logs or repository files.

A status root is an opaque commitment. It is not proof that a credential is revoked or not revoked.

## 6. Testnet acceptance path

1. Re-run contract unit tests and the locked WASM release build against the intended source; the PR #2 contract workflow succeeded at [run 44117993350](https://github.com/wadezigh96/anonymesh/actions/runs/44117993350).
2. Preserve the deployed contract account, deployment transaction, source SHA and WASM checksum in the evidence record.
3. Prepare and review the persistent issuer Ed25519 public metadata; keep private key material local and owner-only.
4. Review the exact `register_issuer` payload, attached storage deposit, gas and expected state change.
5. Obtain explicit owner approval before any signing or broadcast.
6. Read back `get_issuer({"issuer_id":"issuer.testnet"})` from live Testnet RPC and record final block evidence.
7. Run live verifier acceptance/rejection tests against the deployed registry.
8. Record a judge-facing demo that contains no private holder material.

See [NEAR_JUDGE_GUIDE.md](NEAR_JUDGE_GUIDE.md) for the exact live acceptance evidence.

## 7. Optional NEAR ecosystem integrations

NEAR AI Cloud and Agent Connect are optional future integrations, not current dependencies or completed features. Do not describe a generic model API call as TEE attestation; attestation and response-signature verification are separate requirements. Do not connect a funds-moving API to the identity demo without a separately reviewed spending policy and explicit approval.

## 8. Submission and publication

This document does not assert whether a hackathon form, project listing or X post was accepted. Keep external submission receipts and publication links as separate evidence. A repository commit is not a hackathon submission receipt.
