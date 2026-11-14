// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal prototype registry for ANONYMESH membership roots.
/// @dev This contract is intentionally not a complete credential issuer,
///      revocation system, or privacy-preserving verifier. Issuer governance
///      is centralized in this prototype and must be replaced or constrained
///      before production use.
contract AnonMeshRootRegistry {
    address public owner;
    mapping(address => bool) public issuers;
    mapping(uint256 => bool) public knownRoots;

    event IssuerUpdated(address indexed issuer, bool enabled);
    event RootPublished(uint256 indexed root, address indexed issuer);

    error NotOwner();
    error NotIssuer();
    error ZeroAddress();
    error InvalidRoot();

    constructor(address initialIssuer) {
        if (initialIssuer == address(0)) revert ZeroAddress();
        owner = msg.sender;
        issuers[initialIssuer] = true;
        emit IssuerUpdated(initialIssuer, true);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyIssuer() {
        if (!issuers[msg.sender]) revert NotIssuer();
        _;
    }

    function setIssuer(address issuer, bool enabled) external onlyOwner {
        if (issuer == address(0)) revert ZeroAddress();
        issuers[issuer] = enabled;
        emit IssuerUpdated(issuer, enabled);
    }

    function publishRoot(uint256 root) external onlyIssuer {
        if (root == 0) revert InvalidRoot();
        if (!knownRoots[root]) {
            knownRoots[root] = true;
            emit RootPublished(root, msg.sender);
        }
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }
}
