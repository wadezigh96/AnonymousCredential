pragma circom 2.1.6;
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/switcher.circom";

template Inclusion(D) {
    signal input leaf;
    signal input siblings[D];
    signal input bits[D]; // 1 = node ini anak kanan
    signal output root;
    component sw[D]; component h[D];
    signal cur[D+1];
    cur[0] <== leaf;
    for (var i = 0; i < D; i++) {
        bits[i] * (bits[i] - 1) === 0;
        sw[i] = Switcher();
        sw[i].sel <== bits[i]; sw[i].L <== cur[i]; sw[i].R <== siblings[i];
        h[i] = Poseidon(2);
        h[i].inputs[0] <== sw[i].outL; h[i].inputs[1] <== sw[i].outR;
        cur[i+1] <== h[i].out;
    }
    root <== cur[D];
}

template Anon(D) {
    signal input secret;
    signal input nullifierSecret;
    signal input siblings[D];
    signal input bits[D];
    signal input merkleRoot;   // public
    signal input scope;        // public: board(epoch) atau claim
    signal input messageHash;  // public: mengikat pesan/recipient ke proof
    signal output nullifierHash;

    component c = Poseidon(2);
    c.inputs[0] <== secret; c.inputs[1] <== nullifierSecret;

    component inc = Inclusion(D);
    inc.leaf <== c.out; inc.siblings <== siblings; inc.bits <== bits;
    inc.root === merkleRoot;

    component n = Poseidon(2);
    n.inputs[0] <== nullifierSecret; n.inputs[1] <== scope;
    nullifierHash <== n.out;

    signal m2 <== messageHash * messageHash;
}

component main {public [merkleRoot, scope, messageHash]} = Anon(16);
