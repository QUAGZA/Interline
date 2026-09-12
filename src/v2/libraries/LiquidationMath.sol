// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {PriceMath} from "./PriceMath.sol";
import {ShareMath} from "./ShareMath.sol";

/// @title LiquidationMath
/// @notice 100% close factor. Exact debt shares XOR exact collateral. Matches `packages/math`.
library LiquidationMath {
    uint256 internal constant BPS = 10_000;
    uint256 internal constant PRICE_SCALE = 1e36;

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
        uint256 collat = exactCollateral > ownerCollateral ? ownerCollateral : exactCollateral;
        uint256 loanValue = PriceMath.collateralValueLoan(collat, scale36);
        uint256 maxAssets = Math.mulDiv(loanValue, BPS, BPS + uint256(bonusBps));
        uint256 shares = ShareMath.repaySharesBurn(maxAssets, ownerDebtShares, indexRay);
        if (shares == 0) revert ZeroQuote();
        uint256 loanIn = ShareMath.repayAssetsPaid(shares, indexRay);
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
