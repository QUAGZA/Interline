// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LendingMarket} from "./LendingMarket.sol";
import {IMarketOracle} from "./interfaces/IMarketOracle.sol";
import {InterestMath} from "./libraries/InterestMath.sol";
import {ShareMath} from "./libraries/ShareMath.sol";
import {PriceMath} from "./libraries/PriceMath.sol";

/// @title MarketLens
/// @notice Aggregated views for indexer/UI. Does not change market state.
contract MarketLens {
    struct MarketView {
        address loanToken;
        address collateralToken;
        uint8 loanDecimals;
        uint8 collateralDecimals;
        uint8 deliveryMode;
        uint256 accountedCash;
        uint256 totalDebt;
        uint256 supplierAssets;
        uint256 totalSupplyShares;
        uint256 utilizationRay;
        uint256 borrowAprRay;
        uint256 supplyAprRay;
        uint256 borrowApyGrowthRay;
        uint256 supplyApyGrowthRay;
        uint256 epochIndexRay;
        uint64 epochTimestamp;
        bool supplyFrozen;
        bool borrowFrozen;
        bool recallActive;
        uint64 recallDeadline;
        bool terminal;
        uint8 oracleStatus;
        uint256 unaccountedSurplus;
        uint256 supplyCap;
        uint256 borrowCap;
        uint16 maxLtvBps;
        uint16 liquidationThresholdBps;
        uint16 liquidationBonusBps;
    }

    struct PositionView {
        uint256 supplyShares;
        uint256 supplyAssets;
        uint256 maxWithdraw;
        uint256 maxRedeem;
        uint256 debt;
        uint256 principal;
        uint256 collateral;
        uint256 collateralValueLoan;
        uint256 borrowCapacity;
        uint256 liquidationCapacity;
        uint256 healthFactorWad;
        uint8 healthCode;
        bool liquidatable;
        uint256 maxBorrow;
        bool defaulted;
        uint256 writtenOffLiability;
        uint256 positionCap;
    }

    function marketView(address market) external view returns (MarketView memory v) {
        LendingMarket m = LendingMarket(market);
        v.loanToken = address(m.loanToken());
        v.collateralToken = address(m.collateralToken());
        v.loanDecimals = m.loanDecimals();
        v.collateralDecimals = m.collateralDecimals();
        v.deliveryMode = uint8(m.deliveryMode());
        v.accountedCash = m.accountedCash();
        v.totalDebt = m.aggregateDebt();
        v.supplierAssets = m.supplierAssets();
        v.totalSupplyShares = m.totalSupplyShares();
        v.utilizationRay = m.currentUtilizationRay();
        v.borrowAprRay = m.currentBorrowAprRay();
        v.supplyAprRay = InterestMath.supplyAprRay(v.borrowAprRay, v.utilizationRay);
        v.borrowApyGrowthRay = InterestMath.borrowApyGrowthRay(v.borrowAprRay);
        v.supplyApyGrowthRay = InterestMath.supplyApyEstGrowthRay(v.borrowAprRay, v.utilizationRay);
        v.epochIndexRay = m.epochIndexRay();
        v.epochTimestamp = m.epochTimestamp();
        v.supplyFrozen = m.supplyFrozen();
        v.borrowFrozen = m.borrowFrozen();
        v.recallActive = m.recallActive();
        v.recallDeadline = m.recallDeadline();
        v.terminal = m.marketTerminal();
        v.unaccountedSurplus = m.unaccountedSurplus();
        v.supplyCap = m.supplyCap();
        v.borrowCap = m.borrowCap();
        v.maxLtvBps = m.maxLtvBps();
        v.liquidationThresholdBps = m.liquidationThresholdBps();
        v.liquidationBonusBps = m.liquidationBonusBps();
        IMarketOracle.Quote memory q = m.oracle().quote();
        v.oracleStatus = uint8(q.status);
    }

    function positionView(address market, address owner) external view returns (PositionView memory v) {
        LendingMarket m = LendingMarket(market);
        v.supplyShares = m.supplySharesOf(owner);
        v.supplyAssets = ShareMath.supplierClaim(v.supplyShares, m.totalSupplyShares(), m.supplierAssets());
        v.maxWithdraw = m.maxWithdraw(owner);
        v.maxRedeem = m.maxRedeem(owner);
        v.debt = m.positionDebt(owner);
        v.principal = m.principalOutstanding(owner);
        v.collateral = m.collateralOf(owner);
        v.maxBorrow = m.maxBorrow(owner);
        v.defaulted = m.defaulted(owner);
        v.writtenOffLiability = m.writtenOffLiability(owner);
        v.positionCap = m.positionCapOf(owner);
        (
            PriceMath.HealthCode code,
            uint256 hf,
            uint256 debt,
            uint256 liq,
            uint256 borrowCap_,
            bool liqable
        ) = m.healthOf(owner);
        v.healthCode = uint8(code);
        v.healthFactorWad = hf;
        v.debt = debt;
        v.liquidationCapacity = liq;
        v.borrowCapacity = borrowCap_;
        v.liquidatable = liqable;
        IMarketOracle.Quote memory q = m.oracle().quote();
        if (q.status == IMarketOracle.Status.OK) {
            v.collateralValueLoan = PriceMath.collateralValueLoan(v.collateral, q.quoteScale36);
        }
    }
}
