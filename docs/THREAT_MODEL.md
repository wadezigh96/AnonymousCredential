# ANONYMESH threat model (initial)

## Assets

- Holder secrets and credential-opening values.
- Human identity and private attributes.
- Agent identity, owner relationship, and delegated authority.
- Credential membership and revocation state.
- Action authorization and nullifier uniqueness.

## Adversaries

- A verifier attempting to correlate presentations.
- A malicious or compromised agent attempting actions beyond delegated scope.
- A malicious credential holder attempting replay or double-use.
- A malicious issuer or compromised issuer key.
- A relayer or RPC provider observing network metadata.
- A chain observer correlating timing, addresses, roots, and events.

## Security goals

1. Do not put holder secrets or raw identity attributes on-chain.
2. Bind each proof to an explicit protocol version, verifier/application domain, scope, and canonical action digest.
3. Prevent replay within the intended scope using a deterministic nullifier.
4. Reject unknown roots and malformed public inputs.
5. Make issuer trust and revocation assumptions explicit.
6. Ensure agent authority is least-privilege, bounded by action, amount, destination, and expiry where relevant.
7. Avoid stable identifiers across unrelated relying parties.

## Non-goals of the current prototype

- It does not prove one-person-one-identity.
- It does not prove an AI agent is benign, competent, or safe.
- It does not hide transaction timing, sender/relayer metadata, network traffic, or public application data.
- It does not yet implement anonymous issuer signatures, selective disclosure, attribute predicates, revocation proofs, or delegated capabilities.
- It does not provide post-quantum security. The prototype uses a pairing-friendly curve / Groth16-style design and must not be described as quantum-resistant.

## Key design risks to resolve

- Issuer compromise and dishonest issuance.
- Credential revocation without deanonymizing holders.
- Sybil resistance without creating a global tracking identifier.
- Cross-domain nullifier separation and collision-safe domain encoding.
- Trusted setup ceremony integrity and verifier artifact pinning.
- Side-channel and metadata leakage at the wallet, relayer, RPC, and agent-runtime layers.
- Human consent, agent delegation, expiry, and emergency revocation.
