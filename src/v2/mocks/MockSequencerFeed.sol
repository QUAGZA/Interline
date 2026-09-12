// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAggregatorV3} from "../interfaces/IAggregatorV3.sol";

/// @notice Chainlink-style sequencer uptime feed. `answer == 0` means up.
contract MockSequencerFeed is IAggregatorV3 {
    uint8 public constant override decimals = 0;
    int256 public answer;
    uint256 public startedAt;
    uint256 public updatedAt;
    bool public revertOnRead;

    error FeedDown();

    constructor() {
        answer = 0;
        startedAt = block.timestamp;
        updatedAt = block.timestamp;
    }

    function setDown(bool down) external {
        answer = down ? int256(1) : int256(0);
        startedAt = block.timestamp;
        updatedAt = block.timestamp;
    }

    function setStartedAt(uint256 ts) external {
        startedAt = ts;
        updatedAt = ts;
    }

    function setRevert(bool revertOnRead_) external {
        revertOnRead = revertOnRead_;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        if (revertOnRead) revert FeedDown();
        return (1, answer, startedAt, updatedAt, 1);
    }
}
