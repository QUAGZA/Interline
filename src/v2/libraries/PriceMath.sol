// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title PriceMath
/// @notice Collateral-to-loan quotes, LTV/LT capacities, and health factor. Matches `packages/math`.
library PriceMath {
    uint256 internal constant BPS = 10_000;
    uint256 internal constant WAD = 1e18;
    uint256 internal constant PRICE_SCALE = 1e36;
    uint16 internal constant DEFAULT_LTV_BPS = 8000;
    uint16 internal constant DEFAULT_LT_BPS = 9000;
    uint16 internal constant DEFAULT_BONUS_BPS = 500;

    enum HealthCode {
        NO_DEBT,
        OK,
        UNAVAILABLE
    }

    error InvalidDecimals();
    error InvalidQuote();

    function pow10(uint256 exp) internal pure returns (uint256) {
        if (exp > 77) revert InvalidDecimals();
        uint256 r = 1;
        for (uint256 i; i < exp; ++i) {
            r *= 10;
        }
        return r;
    }

    /// @dev `quoteScale36 = floor(Pc * 10^(36 + dl - dc) / Pl)` — loan raw units per collateral raw unit * 1e36.
    function quoteScale36(uint256 collateralUsdWad, uint256 loanUsdWad, uint8 collateralDecimals, uint8 loanDecimals)
        internal
        pure
        returns (uint256)
    {
        if (collateralDecimals < 6 || collateralDecimals > 18 || loanDecimals < 6 || loanDecimals > 18) {
            revert InvalidDecimals();
        }
        if (collateralUsdWad == 0 || loanUsdWad == 0) revert InvalidQuote();
        uint256 exp = 36 + uint256(loanDecimals) - uint256(collateralDecimals);
        return Math.mulDiv(collateralUsdWad, pow10(exp), loanUsdWad);
    }

    function collateralValueLoan(uint256 collateralRaw, uint256 scale36) internal pure returns (uint256) {
        if (collateralRaw == 0 || scale36 == 0) return 0;
        return Math.mulDiv(collateralRaw, scale36, PRICE_SCALE);
    }

    function borrowCapacity(uint256 collatValueLoan, uint16 maxLtvBps) internal pure returns (uint256) {
        return Math.mulDiv(collatValueLoan, maxLtvBps, BPS);
    }

    function liquidationCapacity(uint256 collatValueLoan, uint16 liquidationThresholdBps) internal pure returns (uint256) {
        return Math.mulDiv(collatValueLoan, liquidationThresholdBps, BPS);
    }

    function healthFactorWad(uint256 liqCapacity, uint256 currentDebt) internal pure returns (uint256) {
        if (currentDebt == 0) return 0;
        return Math.mulDiv(liqCapacity, WAD, currentDebt);
    }

    function isLiquidatable(uint256 currentDebt, uint256 liqCapacity) internal pure returns (bool) {
        return currentDebt > liqCapacity;
    }

    function originationAllowed(uint256 postActionDebt, uint256 postActionBorrowCapacity) internal pure returns (bool) {
        return postActionDebt <= postActionBorrowCapacity;
    }

    /// @dev `NO_DEBT` / `UNAVAILABLE` never report a healthy numeric HF. Equality with
    ///      liquidation capacity is not yet liquidatable; `currentDebt == capacity + 1` is.
    function evaluateHealth(uint256 liqCapacity, uint256 currentDebt, bool pricesValid)
        internal
        pure
        returns (HealthCode code, uint256 hfWad, bool liquidatable)
    {
        if (currentDebt == 0) {
            return (HealthCode.NO_DEBT, 0, false);
        }
        if (!pricesValid) {
            return (HealthCode.UNAVAILABLE, 0, false);
        }
        hfWad = healthFactorWad(liqCapacity, currentDebt);
        liquidatable = isLiquidatable(currentDebt, liqCapacity);
        code = HealthCode.OK;
    }
}
