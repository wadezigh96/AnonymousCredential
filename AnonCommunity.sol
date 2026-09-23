// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";

interface IVerifier {
    function verifyProof(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[4] calldata pub) external view returns (bool);
}
interface IERC721 { function balanceOf(address) external view returns (uint256); }

contract AnonCommunity {
    uint256 constant DEPTH = 16;
    uint256 constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    IVerifier public immutable verifier;
    IERC721 public immutable nft;
    uint256 public immutable reward;

    uint256[DEPTH] zeros; uint256[DEPTH] filled;
    uint256 public nextIndex; uint256 public root;
    mapping(uint256 => bool) public knownRoots;
    mapping(address => bool) public registered;
    mapping(uint256 => bool) public used;

    event Registered(uint256 indexed index, uint256 commitment);
    event Message(uint256 indexed epoch, uint256 nullifier, string text);
    event Claimed(address indexed to, uint256 nullifier);

    constructor(address _verifier, address _nft, uint256 _reward) {
        verifier = IVerifier(_verifier); nft = IERC721(_nft); reward = _reward;
        uint256 z;
        for (uint256 i; i < DEPTH; i++) { zeros[i] = z; filled[i] = z; z = PoseidonT3.hash([z, z]); }
        root = z; knownRoots[z] = true;
    }
    receive() external payable {}

    // Credential: pemegang NFT, 1 commitment per wallet
    function register(uint256 commitment) external {
        require(nft.balanceOf(msg.sender) > 0, "not holder");
        require(!registered[msg.sender], "already registered");
        registered[msg.sender] = true;
        uint256 idx = nextIndex++; uint256 node = commitment; uint256 i = idx;
        for (uint256 l; l < DEPTH; l++) {
            if (i % 2 == 0) { filled[l] = node; node = PoseidonT3.hash([node, zeros[l]]); }
            else { node = PoseidonT3.hash([filled[l], node]); }
            i /= 2;
        }
        root = node; knownRoots[node] = true;
        emit Registered(idx, commitment);
    }

    // Board: 1 pesan per credential per hari
    function postMessage(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c,
        uint256 _root, uint256 nullifier, uint256 epoch, string calldata text) external {
        require(epoch == block.timestamp / 1 days, "bad epoch");
        uint256 scope = uint256(keccak256(abi.encode("board", epoch))) % P;
        _check(a, b, c, _root, nullifier, scope, uint256(keccak256(bytes(text))) % P);
        emit Message(epoch, nullifier, text);
    }

    // Claim: sekali per credential; recipient terikat ke proof (anti front-run)
    function claim(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c,
        uint256 _root, uint256 nullifier, address payable to) external {
        uint256 scope = uint256(keccak256("claim")) % P;
        _check(a, b, c, _root, nullifier, scope, uint256(uint160(to)));
        (bool ok,) = to.call{value: reward}(""); require(ok, "send failed");
        emit Claimed(to, nullifier);
    }

    function _check(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c,
        uint256 _root, uint256 nullifier, uint256 scope, uint256 msgHash) internal {
        require(knownRoots[_root], "unknown root");
        require(!used[nullifier], "nullifier used");
        require(verifier.verifyProof(a, b, c, [nullifier, _root, scope, msgHash]), "bad proof");
        used[nullifier] = true;
    }
}
