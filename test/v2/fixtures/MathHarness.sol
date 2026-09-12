// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {InterestMath} from "../../../src/v2/libraries/InterestMath.sol";
import {ShareMath} from "../../../src/v2/libraries/ShareMath.sol";
import {PriceMath} from "../../../src/v2/libraries/PriceMath.sol";
import {LiquidationMath} from "../../../src/v2/libraries/LiquidationMath.sol";

/// @dev Exposes internal libraries for golden-vector tests.
contract MathHarness {
    function rpow(uint256 x, uint256 n, uint256 b) external pure returns (uint256) {
        return InterestMath.rpow(x, n, b);
    }

    function ratePerSecondRay(uint256 apr) external pure returns (uint256) {
        return InterestMath.ratePerSecondRay(apr);
    }

    function growthRay(uint256 apr, uint256 dt) external pure returns (uint256) {
        return InterestMath.growthRay(apr, dt);
    }

    function projectIndex(uint256 epochIndex, uint256 epochApr, uint64 epochTs, uint256 ts)
        external
        pure
        returns (uint256)
    {
        return InterestMath.projectIndex(epochIndex, epochApr, epochTs, ts);
    }

    function utilizationRay(uint256 cash, uint256 debt) external pure returns (uint256) {
        return InterestMath.utilizationRay(cash, debt);
    }

    function borrowAprRay(uint256 util) external pure returns (uint256) {
        return InterestMath.borrowAprRay(util);
    }

    function borrowApyGrowthRay(uint256 apr) external pure returns (uint256) {
        return InterestMath.borrowApyGrowthRay(apr);
    }

    function supplyAprRay(uint256 apr, uint256 util) external pure returns (uint256) {
        return InterestMath.supplyAprRay(apr, util);
    }

    function supplyApyEstGrowthRay(uint256 apr, uint256 util) external pure returns (uint256) {
        return InterestMath.supplyApyEstGrowthRay(apr, util);
    }

    function mintSupplyShares(uint256 assetsIn, uint256 totalShares, uint256 assetsBefore)
        external
        pure
        returns (uint256)
    {
        return ShareMath.mintSupplyShares(assetsIn, totalShares, assetsBefore);
    }

    function withdrawSharesBurn(uint256 assetsOut, uint256 totalShares, uint256 assetsBefore)
        external
        pure
        returns (uint256)
    {
        return ShareMath.withdrawSharesBurn(assetsOut, totalShares, assetsBefore);
    }

    function redeemAssetsOut(uint256 sharesBurn, uint256 totalShares, uint256 assetsBefore)
        external
        pure
        returns (uint256)
    {
        return ShareMath.redeemAssetsOut(sharesBurn, totalShares, assetsBefore);
    }

    function supplierClaim(uint256 shares, uint256 totalShares, uint256 assetsNow) external pure returns (uint256) {
        return ShareMath.supplierClaim(shares, totalShares, assetsNow);
    }

    function borrowDebtShares(uint256 assetsOut, uint256 indexRay) external pure returns (uint256) {
        return ShareMath.borrowDebtShares(assetsOut, indexRay);
    }

    function debtFromShares(uint256 shares, uint256 indexRay) external pure returns (uint256) {
        return ShareMath.debtFromShares(shares, indexRay);
    }

    function repaySharesBurn(uint256 maxAssets, uint256 ownerShares, uint256 indexRay) external pure returns (uint256) {
        return ShareMath.repaySharesBurn(maxAssets, ownerShares, indexRay);
    }

    function repayAssetsPaid(uint256 sharesBurn, uint256 indexRay) external pure returns (uint256) {
        return ShareMath.repayAssetsPaid(sharesBurn, indexRay);
    }

    function maxRedeemShares(uint256 owned, uint256 total, uint256 assets, uint256 cash, uint256 debt)
        external
        pure
        returns (uint256)
    {
        return ShareMath.maxRedeemShares(owned, total, assets, cash, debt);
    }

    function maxWithdrawAssets(uint256 owned, uint256 total, uint256 assets, uint256 cash, uint256 debt)
        external
        pure
        returns (uint256)
    {
        return ShareMath.maxWithdrawAssets(owned, total, assets, cash, debt);
    }

    function quoteScale36(uint256 pc, uint256 pl, uint8 dc, uint8 dl) external pure returns (uint256) {
        return PriceMath.quoteScale36(pc, pl, dc, dl);
    }

    function collateralValueLoan(uint256 raw, uint256 scale) external pure returns (uint256) {
        return PriceMath.collateralValueLoan(raw, scale);
    }

    function borrowCapacity(uint256 value, uint16 ltvBps) external pure returns (uint256) {
        return PriceMath.borrowCapacity(value, ltvBps);
    }

    function liquidationCapacity(uint256 value, uint16 ltBps) external pure returns (uint256) {
        return PriceMath.liquidationCapacity(value, ltBps);
    }

    function healthFactorWad(uint256 cap, uint256 debt) external pure returns (uint256) {
        return PriceMath.healthFactorWad(cap, debt);
    }

    function isLiquidatable(uint256 debt, uint256 cap) external pure returns (bool) {
        return PriceMath.isLiquidatable(debt, cap);
    }

    function originationAllowed(uint256 debt, uint256 cap) external pure returns (bool) {
        return PriceMath.originationAllowed(debt, cap);
    }

    function evaluateHealth(uint256 cap, uint256 debt, bool pricesValid)
        external
        pure
        returns (PriceMath.HealthCode, uint256, bool)
    {
        return PriceMath.evaluateHealth(cap, debt, pricesValid);
    }

    function quoteLiq(
        uint256 exactDebtShares,
        uint256 exactCollateral,
        uint256 ownerDebtShares,
        uint256 ownerCollateral,
        uint256 indexRay,
        uint256 scale36,
        uint16 bonusBps
    ) external pure returns (LiquidationMath.Quote memory) {
        return LiquidationMath.quoteLiquidation(
            exactDebtShares, exactCollateral, ownerDebtShares, ownerCollateral, indexRay, scale36, bonusBps
        );
    }

    function quoteFullClose(
        uint256 ownerDebtShares,
        uint256 ownerCollateral,
        uint256 indexRay,
        uint256 scale36,
        uint16 bonusBps
    ) external pure returns (LiquidationMath.Quote memory) {
        return LiquidationMath.quoteFullClose(ownerDebtShares, ownerCollateral, indexRay, scale36, bonusBps);
    }

    function maxLoanAssetsIn(
        uint256 ownerDebtShares,
        uint256 ownerCollateral,
        uint256 indexRay,
        uint256 scale36,
        uint16 bonusBps
    ) external pure returns (uint256) {
        return LiquidationMath.maxLoanAssetsIn(ownerDebtShares, ownerCollateral, indexRay, scale36, bonusBps);
    }

    function minCollateralOut(
        uint256 ownerDebtShares,
        uint256 ownerCollateral,
        uint256 indexRay,
        uint256 scale36,
        uint16 bonusBps
    ) external pure returns (uint256) {
        return LiquidationMath.minCollateralOut(ownerDebtShares, ownerCollateral, indexRay, scale36, bonusBps);
    }
}
