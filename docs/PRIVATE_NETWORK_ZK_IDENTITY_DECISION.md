# ANONYMESH Private Network and ZK Identity Decision

Status: **architecture decision / target specification only**. This document does not claim that a private chain, NFT contract, ZK-to-NFT binding, or private payment rail has been implemented or deployed.

## Decision

ANONYMESH targets a **private, permissioned NEAR-compatible network**, not NEAR Mainnet and not NEAR Public Testnet, for identity registration, issuer trust, agent authorization and internal Agent A-to-Agent B settlement.

The project name and product promise remain **ANONYMESH — Private Agentic Identity Infrastructure (PAII)**. Privacy is a protocol property enforced through cryptography, restricted network membership and minimized metadata; it is not achieved merely by calling a chain private.

## Network boundary

- Development: isolated localnet and mocked RPC only.
- Integration: isolated ANONYMESH network with permissioned validators, authenticated/private RPC and controlled participant admission.
- Production: same private-network model, with documented validator governance, key custody, recovery, monitoring, incident response and independent review.
- Public NEAR networks: out of scope for private identity records, proof traffic and internal payment activity.
- NEAR Private Shard: optional candidate to evaluate separately. Its published model uses permissioned validators and a bridge to NEAR Mainnet; it must not be assumed to be an isolated, bridge-free ANONYMESH network.

## Identity anchor

A persistent NFT or equivalent identity registry entry may provide an agent's durable internal identity handle. It must not expose a real-world identity, credential, holder secret or private metadata. A publicly observable token ID/owner mapping is a correlation risk, so the NFT ID must never be used as a universal payment or presentation identifier.

Transferability is disabled by default for identity anchors. Recovery and key rotation must be governed by an explicit controller/issuer recovery policy; transferring an identity token must not silently transfer authority over an agent.

## ZK proof binding

The proof must establish that the presenter controls a valid credential/secret bound to an approved identity commitment and is authorized for the exact verifier, audience, recipient, asset, amount/limit, expiry and nonce.

Use pairwise, domain-separated pseudonyms and scoped nullifiers where needed for replay/double-use prevention. Their scope and linkability must be documented. Do not publish a global subject ID or stable NFT ID in routine proofs.

The existing AnonCreds CL presentation proves selected credential claims/predicates. It does **not** currently prove arbitrary NFT ownership or the required NFT-to-credential commitment binding. That binding is a future implementation gate and must use a maintained, reviewed proof construction; no custom cryptographic primitive.

## Private agent-to-agent payment

1. Agent A constructs a payment intent for Agent B with asset, amount, expiry, nonce and policy scope.
2. Agent A proves control of its credential-bound identity commitment and presents a capability authorizing that exact payment.
3. The verifier checks issuer trust, proof, challenge, recipient, amount/limit, expiry, revocation state and replay/nullifier state.
4. The private-network payment contract settles the transfer and emits only the minimum metadata permitted by the network's privacy policy.
5. Agent B receives the payment confirmation without learning Agent A's real-world identity unless an explicitly authorized disclosure policy permits it.

A ZK identity proof alone does not hide token balances, payment amounts, timing, contract state or validator-visible execution. The chosen private payment contract/token model must separately address confidentiality of sender, receiver, amount and transaction graph. Public withdrawals or bridges are explicit privacy-boundary crossings.

## On-chain data policy

Allowed only when necessary: issuer public keys/versions, protocol/schema hashes, governance state, and batched revocation/status commitments. Never store raw identity claims, holder secrets, credential IDs, proof witnesses, global stable pseudonyms or per-presentation activity in contract state or logs.

## Acceptance gates before implementation is called complete

- Private network can be independently started and queried without public Mainnet/Testnet RPC.
- Validator admission/removal and operator trust assumptions are documented.
- Identity anchor is non-transferable by default and has tested recovery/key rotation.
- ZK proof binds credential control to the identity commitment without revealing the anchor ID.
- Two independent verifiers cannot correlate presentations outside explicitly scoped pseudonym domains.
- Replay, duplicate payment, wrong recipient, wrong amount, expired capability, revoked credential and compromised-key cases fail closed.
- Payment confidentiality is measured separately for sender, receiver, amount, timing, balances and validator visibility.
- Contract tests and end-to-end tests run on the private network; no public deployment is used as a substitute.

## Current implementation truth

The repository currently has a preliminary NEAR issuer-registry contract scaffold, a Node AnonCreds demo, a mocked read-only registry adapter and CI tests. It does not yet contain a deployed private network, identity NFT contract, NFT/credential ZK binding, private payment token/contract, or production unlinkability/revocation. These are explicit engineering gaps, not completed features.

## References

- [NEAR Private Shard and Confidential Intents architecture](https://www.near.org/blog/how-confidential-intents-works)
- [NEAR Private Shard overview](https://near.org/blockchain)
- [NEAR localnet documentation overview](https://near-nodes.io/intro/what-is-a-node)
