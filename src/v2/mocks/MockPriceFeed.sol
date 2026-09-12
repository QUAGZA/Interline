// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAggregatorV3} from "../interfaces/IAggregatorV3.sol";

contract MockPriceFeed is IAggregatorV3 {
    uint8 public immutable override decimals;
    int256 public answer;
    uint256 public updatedAt;
    uint80 public roundId = 1;
    bool public revertOnRead;

    error FeedDown();

    constructor(uint8 decimals_, int256 initialAnswer) {
        decimals = decimals_;
        answer = initialAnswer;
        updatedAt = block.timestamp;
    }

    function setAnswer(int256 answer_) external {
        answer = answer_;
        updatedAt = block.timestamp;
        unchecked {
            roundId++;
        }
    }

    function setUpdatedAt(uint256 ts) external {
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
        return (roundId, answer, updatedAt, updatedAt, roundId);
    }
}
