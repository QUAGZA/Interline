// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title InterestMath
/// @notice RAY-scaled variable-rate interest. Formulas match `packages/math`.
/// @dev Floor `mulDiv` only — never `Math.pow` / exp / continuous compounding.
///      `ratePerSecondRay = floor(aprRay / YEAR)`; `YEAR = 31_536_000`.
///      `growth(dt) = rpow(RAY + rps, dt, RAY)`; `I(t) = floor(epochIndex * growth / RAY)`.
///      Arithmetic limits (uint256): max curve APR is `RAY` (100%).
///      `rps(max) = floor(RAY/YEAR) = 31709791983764586504`.
///      10-year max-APR index from `RAY`: `22026462302533824731290734071189` (~2.2026e4 * RAY).
///      At fixture caps (1_000_000 mUSDC supply / 800_000 mUSDC debt, 6 decimals) that index
///      yields ~1.762e16 raw debt units — well inside uint256. Intermediate `rpow` products
///      for this range stay below 2^256.
library InterestMath {
    uint256 internal constant RAY = 1e27;
    uint256 internal constant YEAR = 31_536_000;

    uint256 internal constant BASE_APR_RAY = 2e25;
    uint256 internal constant KINK_RAY = 8e26;
    uint256 internal constant SLOPE1_RAY = 8e25;
    uint256 internal constant SLOPE2_RAY = 9e26;
    uint256 internal constant APR_AT_KINK_RAY = 1e26;

    error InvalidTime();
    error CorruptUtilization();

    /// @dev Exponentiation by squaring with floor `mulDiv`. `rpow(0,0,b) = b`.
    function rpow(uint256 x, uint256 n, uint256 b) internal pure returns (uint256 z) {
        if (x == 0) {
            return n == 0 ? b : 0;
        }
        z = b;
        while (n > 0) {
            if (n & 1 != 0) {
                z = Math.mulDiv(z, x, b);
            }
            n >>= 1;
            if (n != 0) {
                x = Math.mulDiv(x, x, b);
            }
        }
    }

    function ratePerSecondRay(uint256 borrowAprRay_) internal pure returns (uint256) {
        return borrowAprRay_ / YEAR;
    }

    function growthRay(uint256 borrowAprRay_, uint256 dt) internal pure returns (uint256) {
        if (dt == 0) return RAY;
        return rpow(RAY + ratePerSecondRay(borrowAprRay_), dt, RAY);
    }

    function projectIndex(uint256 epochIndexRay, uint256 epochAprRay, uint64 epochTimestamp, uint256 timestamp)
        internal
        pure
        returns (uint256)
    {
        if (timestamp < epochTimestamp) revert InvalidTime();
        uint256 dt = timestamp - uint256(epochTimestamp);
        if (dt == 0) return epochIndexRay;
        return Math.mulDiv(epochIndexRay, growthRay(epochAprRay, dt), RAY);
    }

    function utilizationRay(uint256 cash, uint256 debt) internal pure returns (uint256) {
        uint256 assets = cash + debt;
        if (assets == 0) return 0;
        uint256 u = Math.mulDiv(debt, RAY, assets);
        if (u > RAY) revert CorruptUtilization();
        return u;
    }

    function borrowAprRay(uint256 utilRay) internal pure returns (uint256) {
        if (utilRay > RAY) revert CorruptUtilization();
        if (utilRay <= KINK_RAY) {
            return BASE_APR_RAY + Math.mulDiv(SLOPE1_RAY, utilRay, KINK_RAY);
        }
        uint256 over = utilRay - KINK_RAY;
        return APR_AT_KINK_RAY + Math.mulDiv(SLOPE2_RAY, over, RAY - KINK_RAY);
    }

    function borrowApyGrowthRay(uint256 borrowAprRay_) internal pure returns (uint256) {
        return growthRay(borrowAprRay_, YEAR);
    }

    function supplyAprRay(uint256 borrowAprRay_, uint256 utilRay) internal pure returns (uint256) {
        return Math.mulDiv(borrowAprRay_, utilRay, RAY);
    }

    /// @dev Projected one-year A/S growth with frozen rate and no cashflows: `RAY + U*(g-RAY)`.
    function supplyApyEstGrowthRay(uint256 borrowAprRay_, uint256 utilRay) internal pure returns (uint256) {
        uint256 g = borrowApyGrowthRay(borrowAprRay_);
        if (g <= RAY) return RAY;
        return RAY + Math.mulDiv(utilRay, g - RAY, RAY);
    }
}
