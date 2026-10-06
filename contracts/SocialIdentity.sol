// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice PS67 registry. Profile content is off-chain; msg.sender owns its pointer.
/// DIDs are derived as did:pkh:eip155:<chainId>:<lowercase wallet address>.
contract SocialIdentity {
    mapping(address => string) public profiles;
    mapping(address => mapping(address => bool)) public isFollowing;
    mapping(address => address[]) private followers;
    mapping(address => address[]) private following;
    mapping(address => mapping(address => uint256)) private followerIndex;
    mapping(address => mapping(address => uint256)) private followingIndex;

    event ProfileUpdated(address indexed owner, string cid);
    event Followed(address indexed follower, address indexed target);
    event Unfollowed(address indexed follower, address indexed target);

    function setProfile(string calldata cid) external {
        require(bytes(cid).length > 0 && bytes(cid).length <= 128, "Invalid CID");
        profiles[msg.sender] = cid;
        emit ProfileUpdated(msg.sender, cid);
    }

    function follow(address target) external {
        require(target != address(0) && target != msg.sender, "Invalid target");
        require(bytes(profiles[target]).length > 0, "Profile missing");
        require(!isFollowing[msg.sender][target], "Already following");
        isFollowing[msg.sender][target] = true;
        followerIndex[target][msg.sender] = followers[target].length;
        followingIndex[msg.sender][target] = following[msg.sender].length;
        followers[target].push(msg.sender);
        following[msg.sender].push(target);
        emit Followed(msg.sender, target);
    }

    function unfollow(address target) external {
        require(isFollowing[msg.sender][target], "Not following");
        isFollowing[msg.sender][target] = false;
        uint256 i = followerIndex[target][msg.sender];
        address last = followers[target][followers[target].length - 1];
        followers[target][i] = last;
        followerIndex[target][last] = i;
        followers[target].pop();
        delete followerIndex[target][msg.sender];
        i = followingIndex[msg.sender][target];
        last = following[msg.sender][following[msg.sender].length - 1];
        following[msg.sender][i] = last;
        followingIndex[msg.sender][last] = i;
        following[msg.sender].pop();
        delete followingIndex[msg.sender][target];
        emit Unfollowed(msg.sender, target);
    }

    function getFollowers(address owner) external view returns (address[] memory) {
        return followers[owner];
    }

    function getFollowing(address owner) external view returns (address[] memory) {
        return following[owner];
    }
}
