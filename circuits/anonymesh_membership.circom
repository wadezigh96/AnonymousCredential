pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

// ANONYMESH v0 prototype.
//
// Public inputs (in this exact declaration order):
//   merkleRoot, scope, requestHash
// Public outputs:
//   nullifierHash, requestBinding
//
// Expected public-signal vector for the matching verifier integration:
//   [merkleRoot, scope, requestHash, nullifierHash, requestBinding]
//
// The relying application MUST derive requestHash from the actual canonical
// action parameters and MUST check requestBinding against Poseidon(scope,
// requestHash). Passing an arbitrary caller-chosen requestHash does not bind
// the proof to an application action.
//
// This circuit proves membership of Poseidon(secret, nullifierSecret) under
// merkleRoot, derives a scope-specific nullifier, and exposes a constrained
// action-binding value. It does NOT prove issuer signature validity or
// credential attribute predicates.

template AnonMeshInclusion(D) {
    signal input leaf;
    signal input siblings[D];
    signal input pathBits[D];
    signal output root;

    signal current[D + 1];
    signal left[D];
    signal right[D];
    component hashes[D];

    current[0] <== leaf;

    for (var i = 0; i < D; i++) {
        pathBits[i] * (pathBits[i] - 1) === 0;

        left[i] <== (1 - pathBits[i]) * current[i] + pathBits[i] * siblings[i];
        right[i] <== pathBits[i] * current[i] + (1 - pathBits[i]) * siblings[i];

        hashes[i] = Poseidon(2);
        hashes[i].inputs[0] <== left[i];
        hashes[i].inputs[1] <== right[i];
        current[i + 1] <== hashes[i].out;
    }

    root <== current[D];
}

template AnonMeshMembership(D) {
    signal input secret;
    signal input nullifierSecret;
    signal input siblings[D];
    signal input pathBits[D];

    // Public inputs.
    signal input merkleRoot;
    signal input scope;
    signal input requestHash;

    // Public outputs.
    signal output nullifierHash;
    signal output requestBinding;

    component leafCommitment = Poseidon(2);
    leafCommitment.inputs[0] <== secret;
    leafCommitment.inputs[1] <== nullifierSecret;

    component inclusion = AnonMeshInclusion(D);
    inclusion.leaf <== leafCommitment.out;
    inclusion.siblings <== siblings;
    inclusion.pathBits <== pathBits;
    inclusion.root === merkleRoot;

    component nullifier = Poseidon(2);
    nullifier.inputs[0] <== nullifierSecret;
    nullifier.inputs[1] <== scope;
    nullifierHash <== nullifier.out;

    component binding = Poseidon(2);
    binding.inputs[0] <== scope;
    binding.inputs[1] <== requestHash;
    requestBinding <== binding.out;
}

component main {public [merkleRoot, scope, requestHash]} = AnonMeshMembership(16);
