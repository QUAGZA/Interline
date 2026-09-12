// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAggregatorV3} from "../interfaces/IAggregatorV3.sol";
import {IMarketOracle} from "../interfaces/IMarketOracle.sol";
import {PriceMath} from "../libraries/PriceMath.sol";

/// @title ChainlinkPairOracle
/// @notice Collateral/USD + loan/USD + sequencer. Testnets use mock feeds (`oracleMode: simulated`).
contract ChainlinkPairOracle is IMarketOracle {
    IAggregatorV3 public immutable collateralUsd;
    IAggregatorV3 public immutable loanUsd;
    IAggregatorV3 public immutable sequencer;
    uint8 public immutable collateralTokenDecimals;
    uint8 public immutable loanTokenDecimals;
    uint256 public immutable maxCollateralAge;
    uint256 public immutable maxLoanAge;
    uint256 public immutable sequencerGrace;

    error ZeroAddress();
    error InvalidDecimals();

    constructor(
        address collateralUsd_,
        address loanUsd_,
        address sequencer_,
        uint8 collateralTokenDecimals_,
        uint8 loanTokenDecimals_,
        uint256 maxCollateralAge_,
        uint256 maxLoanAge_,
        uint256 sequencerGrace_
    ) {
        if (collateralUsd_ == address(0) || loanUsd_ == address(0) || sequencer_ == address(0)) revert ZeroAddress();
        if (
            collateralTokenDecimals_ < 6 || collateralTokenDecimals_ > 18 || loanTokenDecimals_ < 6
                || loanTokenDecimals_ > 18
        ) revert InvalidDecimals();
        collateralUsd = IAggregatorV3(collateralUsd_);
        loanUsd = IAggregatorV3(loanUsd_);
        sequencer = IAggregatorV3(sequencer_);
        collateralTokenDecimals = collateralTokenDecimals_;
        loanTokenDecimals = loanTokenDecimals_;
        maxCollateralAge = maxCollateralAge_;
        maxLoanAge = maxLoanAge_;
        sequencerGrace = sequencerGrace_;
    }

    function quote() external view returns (Quote memory q) {
        if (!_sequencerOk(q)) return q;

        (uint256 pc, uint256 tc, Status sc) = _readFeed(collateralUsd, maxCollateralAge);
        q.collateralUsdWad = pc;
        q.collateralUpdatedAt = tc;
        if (sc != Status.OK) {
            q.status = sc;
            return q;
        }

        (uint256 pl, uint256 tl, Status sl) = _readFeed(loanUsd, maxLoanAge);
        q.loanUsdWad = pl;
        q.loanUpdatedAt = tl;
        if (sl != Status.OK) {
            q.status = sl;
            return q;
        }

        q.quoteScale36 = PriceMath.quoteScale36(pc, pl, collateralTokenDecimals, loanTokenDecimals);
        if (q.quoteScale36 == 0) {
            q.status = Status.INVALID;
            return q;
        }
        q.status = Status.OK;
    }

    function _sequencerOk(Quote memory q) private view returns (bool) {
        try sequencer.latestRoundData() returns (uint80, int256 answer, uint256 startedAt, uint256 updatedAt, uint80) {
            if (updatedAt == 0 || startedAt == 0) {
                q.status = Status.INVALID;
                return false;
            }
            if (answer != 0) {
                q.status = Status.SEQUENCER_DOWN;
                return false;
            }
            if (block.timestamp < startedAt + sequencerGrace) {
                q.status = Status.SEQUENCER_DOWN;
                return false;
            }
            return true;
        } catch {
            q.status = Status.UNAVAILABLE;
            return false;
        }
    }

    function _readFeed(IAggregatorV3 feed, uint256 maxAge)
        private
        view
        returns (uint256 wad, uint256 updatedAt, Status status)
    {
        try feed.latestRoundData() returns (uint80, int256 answer, uint256, uint256 updatedAt_, uint80) {
            if (answer <= 0 || updatedAt_ == 0 || updatedAt_ > block.timestamp) {
                return (0, updatedAt_, Status.INVALID);
            }
            if (block.timestamp - updatedAt_ > maxAge) {
                return (0, updatedAt_, Status.STALE);
            }
            uint8 dec = feed.decimals();
            if (dec > 18) return (0, updatedAt_, Status.INVALID);
            wad = uint256(answer) * (10 ** (18 - dec));
            return (wad, updatedAt_, Status.OK);
        } catch {
            return (0, 0, Status.UNAVAILABLE);
        }
    }
}
