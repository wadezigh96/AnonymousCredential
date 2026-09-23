# Anonymous Community (ZK)
Board anonim + claim reward sekali pakai untuk pemegang NFT. Groth16 / Circom / Solidity.

## Setup circuit (testnet, ceremony lokal)
    npm i circomlib snarkjs circomlibjs @zk-kit/imt poseidon-solidity
    mkdir build && circom circuits/anon.circom --r1cs --wasm -l node_modules -o build
    snarkjs powersoftau new bn128 15 build/p0.ptau
    snarkjs powersoftau contribute build/p0.ptau build/p1.ptau --name=me -e="random"
    snarkjs powersoftau prepare phase2 build/p1.ptau build/pot.ptau
    snarkjs groth16 setup build/anon.r1cs build/pot.ptau build/a0.zkey
    snarkjs zkey contribute build/a0.zkey build/anon.zkey --name=me -e="random"
    snarkjs zkey export solidityverifier build/anon.zkey contracts/Verifier.sol
    cp build/anon_js/anon.wasm build/anon.zkey web/public/

## Contract (Foundry)
Remapping: `poseidon-solidity/=node_modules/poseidon-solidity/`
Deploy `Groth16Verifier` (dari Verifier.sol), lalu `AnonCommunity(verifier, nft, rewardWei)`, lalu kirim ETH ke contract untuk dana reward.

## Catatan privasi
- Register dengan wallet A, kirim `postMessage`/`claim` dari wallet B (burner/relayer).
- Ceremony lokal hanya untuk testnet.
