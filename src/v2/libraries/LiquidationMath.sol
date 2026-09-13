// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {PriceMath} from "./PriceMath.sol";
import {ShareMath} from "./ShareMath.sol";

/// @title LiquidationMath
/// @notice 100% close factor. Exact debt shares XOR exact collateral. Matches `packages/math`.
/// @dev Rounding (raw units). Collateral from repayment uses two ceils (`_collateralForRepay`):
///      `valued = ceil(loanIn * (BPS + bonusBps) / BPS)` and
///      `collateralOut = ceil(valued * PRICE_SCALE / scale36)`.
///      Seized collateral value in loan raw units is therefore at most
///      `valued + floor((scale36 - 1) / PRICE_SCALE)`.
///      Exact-collateral quotes that do not hit the remaining-debt cap size repayment with
///      `floor(value * BPS / (BPS + bonusBps))` and may sit 1 additional loan raw unit above
///      that ceil-bonus amount. Uniform bound: `maxSeizedValueLoan`.
library LiquidationMath {
    uint256 internal constant BPS = 10_000;
    uint256 internal constant PRICE_SCALE = 1e36;
    /// @dev Extra loan raw unit allowed when exact-collateral uses the floor bonus inverse.
    uint256 internal constant BONUS_INVERSE_SLACK_LOAN = 1;

    error InvalidQuoteMode();
    error ZeroQuote();

    struct Quote {
        uint256 debtSharesBurned;
        uint256 loanAssetsIn;
        uint256 collateralOut;
        bool writesOff;
    }

    function quoteLiquidation(
        uint256 exactDebtShares,
        uint256 exactCollateral,
        uint256 ownerDebtShares,
        uint256 ownerCollateral,
        uint256 indexRay,
        uint256 scale36,
        uint16 bonusBps
    ) internal pure returns (Quote memory q) {
        if ((exactDebtShares == 0) == (exactCollateral == 0)) revert InvalidQuoteMode();
        if (ownerDebtShares == 0) revert ZeroQuote();
        if (scale36 == 0) revert ZeroQuote();

        if (exactDebtShares > 0) {
            q = _fromDebtShares(exactDebtShares, ownerDebtShares, ownerCollateral, indexRay, scale36, bonusBps);
        } else {
            q = _fromCollateral(exactCollateral, ownerDebtShares, ownerCollateral, indexRay, scale36, bonusBps);
        }
    }

    /// @notice 100% close factor: exact remaining owner debt shares (XOR collateral is zero).
    function quoteFullClose(
        uint256 ownerDebtShares,
        uint256 ownerCollateral,
        uint256 indexRay,
        uint256 scale36,
        uint16 bonusBps
    ) internal pure returns (Quote memory) {
        return quoteLiquidation(ownerDebtShares, 0, ownerDebtShares, ownerCollateral, indexRay, scale36, bonusBps);
    }

    /// @notice Tight `liquidate` slippage bound: loan assets paid for a 100% debt-share close.
    function maxLoanAssetsIn(
        uint256 ownerDebtShares,
        uint256 ownerCollateral,
        uint256 indexRay,
        uint256 scale36,
        uint16 bonusBps
    ) internal pure returns (uint256) {
        return quoteFullClose(ownerDebtShares, ownerCollateral, indexRay, scale36, bonusBps).loanAssetsIn;
    }

    /// @notice Tight `liquidate` slippage bound: collateral received for a 100% debt-share close.
    function minCollateralOut(
        uint256 ownerDebtShares,
        uint256 ownerCollateral,
        uint256 indexRay,
        uint256 scale36,
        uint16 bonusBps
    ) internal pure returns (uint256) {
        return quoteFullClose(ownerDebtShares, ownerCollateral, indexRay, scale36, bonusBps).collateralOut;
    }

    function slippageBounds(Quote memory q) internal pure returns (uint256 maxLoanIn, uint256 minCollatOut) {
        return (q.loanAssetsIn, q.collateralOut);
    }

    /// @notice Upper bound on seized collateral value, in loan-token raw units.
    /// @dev `ceil(loanIn * (BPS + bonusBps) / BPS) + floor((scale36 - 1) / PRICE_SCALE)`
    ///      plus `BONUS_INVERSE_SLACK_LOAN` (1) when `debtShareCapBound` is false.
    function maxSeizedValueLoan(uint256 loanIn, uint256 scale36, uint16 bonusBps, bool debtShareCapBound)
        internal
        pure
        returns (uint256)
    {
        uint256 valued = Math.mulDiv(loanIn, BPS + uint256(bonusBps), BPS, Math.Rounding.Ceil);
        uint256 priceCeilSlack = scale36 == 0 ? 0 : (scale36 - 1) / PRICE_SCALE;
        return valued + priceCeilSlack + (debtShareCapBound ? 0 : BONUS_INVERSE_SLACK_LOAN);
    }

    function _fromDebtShares(
        uint256 exactDebtShares,
        uint256 ownerDebtShares,
        uint256 ownerCollateral,
        uint256 indexRay,
        uint256 scale36,
        uint16 bonusBps
    ) private pure returns (Quote memory q) {
        uint256 shares = exactDebtShares > ownerDebtShares ? ownerDebtShares : exactDebtShares;
        uint256 loanIn = ShareMath.repayAssetsPaid(shares, indexRay);
        uint256 collat = _collateralForRepay(loanIn, scale36, bonusBps);
        if (collat > ownerCollateral) collat = ownerCollateral;
        uint256 remainingShares = ownerDebtShares - shares;
        q.debtSharesBurned = shares;
        q.loanAssetsIn = loanIn;
        q.collateralOut = collat;
        q.writesOff = remainingShares > 0 && ownerCollateral == collat;
    }

    function _fromCollateral(
        uint256 exactCollateral,
        uint256 ownerDebtShares,
        uint256 ownerCollateral,
        uint256 indexRay,
        uint256 scale36,
        uint16 bonusBps
    ) private pure returns (Quote memory q) {
        uint256 requested = exactCollateral > ownerCollateral ? ownerCollateral : exactCollateral;
        uint256 loanValue = PriceMath.collateralValueLoan(requested, scale36);
        uint256 maxAssets = Math.mulDiv(loanValue, BPS, BPS + uint256(bonusBps));
        uint256 shares = ShareMath.repaySharesBurn(maxAssets, ownerDebtShares, indexRay);
        if (shares == 0) revert ZeroQuote();
        uint256 loanIn = ShareMath.repayAssetsPaid(shares, indexRay);
        uint256 collat = requested;
        // Remaining debt can cap burned shares below the budget implied by `requested`.
        // Recompute collateral from actual repayment + bonus so the liquidator cannot
        // keep the full request after paying only the leftover debt.
        if (shares == ownerDebtShares) {
            uint256 collatFromRepay = _collateralForRepay(loanIn, scale36, bonusBps);
            if (collatFromRepay < collat) collat = collatFromRepay;
        }
        q.debtSharesBurned = shares;
        q.loanAssetsIn = loanIn;
        q.collateralOut = collat;
        q.writesOff = (ownerCollateral == collat) && (shares < ownerDebtShares);
    }

    function _collateralForRepay(uint256 loanIn, uint256 scale36, uint16 bonusBps) private pure returns (uint256) {
        uint256 valued = Math.mulDiv(loanIn, BPS + uint256(bonusBps), BPS, Math.Rounding.Ceil);
        return Math.mulDiv(valued, PRICE_SCALE, scale36, Math.Rounding.Ceil);
    }
}
