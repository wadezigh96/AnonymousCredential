# ANONYMESH — NEAR Hackathon MVP Plan

Date: 2026-11-14
Target: NEAR Hackathon public prototype
Network: **NEAR testnet only**
Status: scope and acceptance plan; not an implementation report.

## 1. Time-boxed objective

Prioritize one demonstrable end-to-end privacy and agent-authorization flow over broad protocol completeness. The official event page states the development/submission cutoff is 2026-11-14 23:59 UTC. That is 2026-11-15 06:59 WIB (UTC+7) and 07:59 Singapore time (UTC+8). The official site says one submission per project and requires a public repository plus a public X demo post with video or screenshots. Confirm the live form before sending anything.

Recommended tracks: **Privacy & Private AI** (privacy-preserving credentials and private AI) and **AI Security & Defense** (agent authentication, delegated capabilities, spending/action limits and policy enforcement). Select both only if the working demo genuinely demonstrates both. Do not claim Agent Economy unless the prototype actually performs agent commerce/payments.

## 2. NEAR Builders — the three official build paths

The current [NEAR Builders /build guide](https://nearbuilders.org/build) presents three distinct paths. ANONYMESH should use them selectively rather than treating them as one product:

### A. Smart Contracts — NEAR testnet

- Use the official [NEAR smart-contract documentation](https://docs.near.org/smart-contracts/what-is), [SDK reference](https://docs.near.org/tools/sdk) and [contract examples](https://docs.near.org/tools/contracts-list).
- Obtain disposable testnet funds from [NEAR Faucet](https://near-faucet.io/).
- Build the ANONYMESH issuer/status registry for testnet only. Keep personal claims and credential presentations off-chain.
- Verify contract behavior locally before any testnet deployment. Deployment is an external action and still requires the user's explicit approval.

### B. Private Cloud — NEAR AI Cloud

This is the most immediately useful AI integration for ANONYMESH. NEAR Builders documents an OpenAI-compatible API at `https://cloud-api.near.ai/v1`; obtain an API key from the [NEAR AI Cloud dashboard](https://cloud.near.ai/). This is a cloud API, not the NEAR blockchain RPC and not the separate `gateway.near.ai` desktop application.

Recommended integration:

1. Keep the API key in a local environment variable such as `NEAR_AI_KEY`; never commit it, paste it into source code, or put it in a public repo.
2. Use the OpenAI-compatible API only for non-secret agent reasoning, for example generating a presentation request or explaining a verifier result.
3. Do not send holder secrets, credential witnesses, raw personal claims, private keys or revocation secrets to the model.
4. Query `/v1/models` and choose an actually available model; do not hardcode a model name copied from an old example.
5. For the Privacy & Private AI track, request a fresh 32-byte random nonce (64 hex characters), fetch the model attestation report with the API key, verify the NVIDIA and Intel TDX attestation chain and GPU/CPU binding as specified in [NEAR AI Cloud verification docs](https://docs.near.ai/cloud/verification), then verify the chat response signature against the attested signing address.
6. Show a clear verification panel: what was checked, which model/attestation was used, and any checks that were skipped or failed. Fail closed if a required attestation or signature check fails.
7. Use fictional sample data in the demo. Do not claim that a normal API response alone proves TEE execution; the attestation and response signature checks are separate requirements.

Official quickstart and code examples: [NEAR AI Cloud](https://near.ai/), [Cloud documentation](https://docs.near.ai/cloud/introduction), [verification example](https://github.com/near-examples/nearai-cloud-verification-example), and [near-ai-cloud agent skill](https://github.com/near/agent-skills/tree/main/skills/near-ai-cloud).

### C. Agentic Commerce — Agent Connect

NEAR Builders also points to [Agent Connect](https://github.com/NEAR-Intents-Agent-API/skills), which gives an AI agent an account on NEAR Intents under owner-signed rules. The documented demo API base URL is `https://api.demo.agentsonintents.com`; access requires a separate partner-portal API key.

Keep this as an optional stretch goal, not a critical dependency for the ANONYMESH identity demo. Before integrating, verify the current API docs, partner access, network/environment, asset support, spending limits and whether the demo endpoint can operate without real-value settlement. Do not send mainnet swaps, payments or settlement transactions. ANONYMESH delegated capabilities can be demonstrated locally first without connecting a funds-moving API.

### D. Builder community and project visibility

NEAR Builders also offers a builder profile, project sharing and builder chat. A public project listing can help collaborators discover ANONYMESH, but it is a separate external publication and requires the user's approval. Do not submit a profile, project, public post or share coding traces automatically.

NEAR Builders' terms state users must be at least 18, builder profiles and proposals may be reviewed, and API credit claims are limited to one per builder. The terms also state IP addresses may be stored with claims for duplicate/fraud prevention. Review the [Terms of Service](https://nearbuilders.org/terms-of-service) before claiming credits or publishing personal information.

### Gateway naming clarification

`gateway.near.ai` and `cloud-api.near.ai` must not be conflated. The current /build guide points developers to NEAR AI Cloud at `cloud-api.near.ai/v1`. The separate NEAR AI Gateway desktop tooling is not required for the ANONYMESH runtime and is not the blockchain RPC.

## 3. Testnet-first architecture

- NEAR testnet is the only chain target for the hackathon demo.
- Use a dedicated testnet account and testnet-only configuration. Never put mainnet account IDs, keys or RPC endpoints in the demo configuration.
- Contract stores only issuer public-key/version records, schema/protocol hashes and versioned status/revocation commitments needed for verification.
- No human names, emails, phone numbers, raw credential claims, holder secrets, credential identifiers, proof witnesses or per-presentation logs on-chain.
- Credential issuance and proof generation remain off-chain and local to the holder. Verification can run in the demo service; the contract is a public trust/status anchor, not a private data store.
- Keep testnet contract calls and deploy steps separate from local tests. No mainnet deployment or mainnet transaction is part of this plan.

## 4. Minimum viable demonstration

1. Issuer publishes its public key/version and schema hash to the testnet registry.
2. Human or agent holder obtains a test credential using the selected credential library after dependency and advisory review.
3. Holder stores credential material locally; no private credential data is uploaded.
4. Agent B requests a challenge containing a fresh nonce, audience, task/action scope and expiry.
5. Agent A returns a presentation/proof and a delegated capability bound to the challenge and agent key.
6. Verifier checks issuer trust, credential proof, challenge freshness, audience, task scope, expiry and revocation state.
7. Demo displays VALID or REJECTED and the public testnet transaction/hash for the registry setup only. Do not expose holder identity.

If full AnonCreds proof generation cannot be made reliable within the timebox, do not fake it or label a signature-only mock as ZK. Show the working testnet registry and a clearly labelled local cryptographic prototype, and list unimplemented proof/revocation pieces honestly.

## 5. Required negative tests

- Replayed nonce is rejected.
- Wrong audience or task/action is rejected.
- Modified capability digest is rejected.
- Expired challenge/capability is rejected.
- Revoked or unknown issuer/key version is rejected.
- Credential substitution or holder-binding mismatch is rejected.
- Child capability cannot widen parent actions, resources, expiry or quota.
- Testnet RPC unavailable or status root stale causes a fail-closed result for protected actions.

## 6. Hackathon deliverables

- Public repository with reproducible local setup and test instructions.
- Testnet contract source, deployment configuration and verifiable testnet transaction reference, only after explicit approval to deploy.
- Demo script/video showing successful and rejected presentations without exposing private identity.
- README accurately labels implemented, mocked and planned features.
- Threat model and benchmark notes; no unsupported production/privacy claims.

Official event information: [NEAR Hackathon](https://nearhackathon.com/). Gateway: [NEAR AI Gateway](https://gateway.near.ai/), [download requirements](https://gateway.near.ai/download/), [data handling](https://gateway.near.ai/your-data/).

## 7. Explicit safety boundary

Testnet is not a security guarantee. Use only disposable test credentials and testnet funds. No mainnet transaction, mainnet deployment, wallet import, private-key upload, trace sharing, hackathon submission or X post is authorized by this plan. Obtain explicit user approval for each external action.