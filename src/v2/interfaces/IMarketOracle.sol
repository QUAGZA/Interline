// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMarketOracle {
    enum Status {
        OK,
        STALE,
        SEQUENCER_DOWN,
        INVALID,
        UNAVAILABLE
    }

    struct Quote {
        uint256 collateralUsdWad;
        uint256 loanUsdWad;
        uint256 quoteScale36;
        uint256 collateralUpdatedAt;
        uint256 loanUpdatedAt;
        Status status;
    }

    function quote() external view returns (Quote memory);
}
