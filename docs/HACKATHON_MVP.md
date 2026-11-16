# ANONYMESH — NEAR Hackathon Technical Scope

**Project:** ANONYMESH — Private Agentic Identity Infrastructure (PAII)  
**Network target:** NEAR Testnet for public issuer metadata only  
**Status date:** 2026-11-16  
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
- GitHub Actions evidence for the Node proof flow, separate-process integration and an earlier Rust/WASM contract build; see [PROJECT_STATUS.md](PROJECT_STATUS.md) for exact commits and run IDs.

## 4. What is not claimed

- No live NEAR Testnet contract deployment or issuer-registration transaction yet.
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

1. Re-run contract unit tests and WASM build against the latest source.
2. Establish a supported signer and contract-account strategy without exporting wallet secrets.
3. Review WASM SHA-256, initialization arguments, gas and storage costs.
4. Obtain explicit approval before signing deployment.
5. Deploy and record contract account ID, transaction hash, explorer URL, source commit and WASM checksum.
6. Register a disposable test issuer with the required storage deposit.
7. Read back owner and issuer state from live RPC.
8. Run valid/invalid issuer and RPC-failure tests against the live registry.
9. Record a judge-facing demo that contains no private holder material.

See [NEAR_JUDGE_GUIDE.md](NEAR_JUDGE_GUIDE.md) for the exact live acceptance evidence.

## 7. Optional NEAR ecosystem integrations

NEAR AI Cloud and Agent Connect are optional future integrations, not current dependencies or completed features. Do not describe a generic model API call as TEE attestation; attestation and response-signature verification are separate requirements. Do not connect a funds-moving API to the identity demo without a separately reviewed spending policy and explicit approval.

## 8. Submission and publication

This document does not assert whether a hackathon form, project listing or X post was accepted. Keep external submission receipts and publication links as separate evidence. A repository commit is not a hackathon submission receipt.
