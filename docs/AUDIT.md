# Initial audit — legacy AnonymousCredential

Date: 2026-11-14  
Scope: publicly visible Git history for `wadezigh96/AnonymousCredential`, default branch `main`, and the historical source added in commit `0184d49b1580525429ef8a85fc922c98bd703c1d`.

## Repository state observed

- Default branch: `main`.
- The repository root returned an empty contents list at the time of inspection.
- The latest two source commits on 2026-11-14 removed `anon.circom` and `AnonCommunity.sol`.
- The historical implementation was recovered from commit diffs, not assumed to be present in the current branch.
- No tests, generated verifier, dependency lockfile, CI workflow, or reproducible trusted-setup artifact were found in the inspected history.

## Critical findings

### C-01 — action/message binding was ineffective

The old circuit declared `messageHash` as public but only assigned `signal m2 <== messageHash * messageHash`. That signal was not used in a constraint or public output. The proof therefore did not establish the intended relationship between the proof and the message/recipient. The Solidity contract nevertheless supplied a message hash to the verifier.

**Impact:** the intended anti-front-running/action-binding property was not established by the circuit.

### C-02 — public-signal ordering was not demonstrated

The old Solidity verifier interface expected four public values in the order `[nullifier, root, scope, msgHash]`. The old Circom main declared public inputs `[merkleRoot, scope, messageHash]` and an output `nullifierHash`. Circom/snarkjs public-signal ordering must be verified against the exact generated verifier and proof artifacts. The source did not document or test that ordering.

**Impact:** proof verification could reject valid proofs or, worse, verify a different statement than intended if the integration made an incorrect assumption.

## High findings

### H-01 — unbounded Merkle insertion

The old contract used a depth-16 tree but did not reject insertions once the index reached the tree capacity (65,536 leaves).

**Impact:** index/path assumptions can break after capacity is exceeded.

### H-02 — wallet-based registration is not human/agent identity

The old contract enforced one registration per EVM address and checked an NFT balance. This is not proof of one human or one agent per identity. Wallet rotation and multiple wallets can bypass the uniqueness assumption; NFT transfers and issuer semantics were not addressed.

### H-03 — public event content leaks metadata

The old `Message` event emitted the message text publicly. Even if the author is hidden, content, timing, transaction sender, relayer behavior, and repeated nullifier patterns can leak information.

### H-04 — trusted setup and verifier provenance were underspecified

The historical README suggested a local ceremony and generated verifier but did not define a multi-party ceremony, contribution verification, artifact hashes, reproducibility, or production ceremony policy.

## Medium findings

- No tests were present for invalid Merkle paths, bit constraints, duplicate nullifiers, unknown roots, recipient binding, tree capacity, or malformed public inputs.
- The root registry and issuer authorization model were not separated from the application contract.
- The `claim` flow accepted a recipient address; the intended recipient binding depended on the ineffective circuit binding described in C-01.
- The old design's NFT gate disclosed a public wallet-to-membership registration relationship and is not a general anonymous credential issuance protocol.

## Remediation in this branch

- Replaced the ineffective unused `messageHash * messageHash` signal with an explicit Poseidon action-binding output in the new prototype circuit.
- Documented the expected public-signal order in source comments.
- Added a small issuer-controlled root registry with explicit prototype limitations.
- Kept the work on a feature branch; `main` was not changed.

## Not yet verified

The current prototype has not yet been compiled with Circom, tested with snarkjs, compared against a generated Solidity verifier, fuzzed, or independently reviewed. No claim of cryptographic correctness or production security is made.
