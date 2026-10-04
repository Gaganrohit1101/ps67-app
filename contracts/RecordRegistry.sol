// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title RecordRegistry
/// @notice Stores a fingerprint (SHA-256 hash) of each record. The full record lives off-chain.
///         Anyone can later re-hash the record and compare it with the hash stored here.
contract RecordRegistry {
    /// Emitted every time a new hash is stored, so the frontend and the explorer can see it
    event RecordStored(uint256 indexed id, bytes32 hash, address indexed by, uint256 time);

    /// id => hash of the record (ids start at 1)
    mapping(uint256 => bytes32) public records;

    /// How many records have been stored so far
    uint256 public count;

    /// Save a new hash and return the id it was stored under
    function store(bytes32 hash) external returns (uint256 id) {
        id = ++count;
        records[id] = hash;
        emit RecordStored(id, hash, msg.sender, block.timestamp);
    }

    /// Check whether a hash matches the one stored under an id
    function verify(uint256 id, bytes32 hash) external view returns (bool) {
        return records[id] == hash;
    }
}
