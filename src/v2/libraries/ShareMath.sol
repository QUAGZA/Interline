// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title ShareMath
/// @notice Internal supply-share and debt-share conversions. Matches `packages/math`.
library ShareMath {
    uint256 internal constant SUPPLY_SHARE_SCALE = 1e12;
    uint256 internal constant DEBT_SHARE_SCALE = 1e27;
    uint256 internal constant DEBT_DENOMINATOR = 1e54;

    error ZeroAmount();
    error ZeroShares();
    error InvalidShareState();

    function mintSupplyShares(uint256 assetsIn, uint256 totalShares, uint256 assetsBefore)
        internal
        pure
        returns (uint256 sharesOut)
    {
        if (assetsIn == 0) revert ZeroAmount();
        if (totalShares == 0 && assetsBefore == 0) {
            sharesOut = assetsIn * SUPPLY_SHARE_SCALE;
        } else {
            if (totalShares == 0 || assetsBefore == 0) revert InvalidShareState();
            sharesOut = Math.mulDiv(assetsIn, totalShares, assetsBefore);
        }
        if (sharesOut == 0) revert ZeroShares();
    }

    function withdrawSharesBurn(uint256 assetsOut, uint256 totalShares, uint256 assetsBefore)
        internal
        pure
        returns (uint256)
    {
        if (assetsOut == 0) revert ZeroAmount();
        if (totalShares == 0 || assetsBefore == 0) revert InvalidShareState();
        return Math.mulDiv(assetsOut, totalShares, assetsBefore, Math.Rounding.Ceil);
    }

    function redeemAssetsOut(uint256 sharesBurn, uint256 totalShares, uint256 assetsBefore)
        internal
        pure
        returns (uint256)
    {
        if (sharesBurn == 0) revert ZeroAmount();
        if (totalShares == 0 || assetsBefore == 0) revert InvalidShareState();
        return Math.mulDiv(sharesBurn, assetsBefore, totalShares);
    }

    function supplierClaim(uint256 shares, uint256 totalShares, uint256 assetsNow) internal pure returns (uint256) {
        if (shares == 0 || totalShares == 0 || assetsNow == 0) return 0;
        return Math.mulDiv(shares, assetsNow, totalShares);
    }

    function borrowDebtShares(uint256 assetsOut, uint256 indexRay) internal pure returns (uint256) {
        if (assetsOut == 0) revert ZeroAmount();
        if (indexRay == 0) revert InvalidShareState();
        return Math.mulDiv(assetsOut, DEBT_DENOMINATOR, indexRay, Math.Rounding.Ceil);
    }

    function debtFromShares(uint256 shares, uint256 indexRay) internal pure returns (uint256) {
        if (shares == 0) return 0;
        if (indexRay == 0) revert InvalidShareState();
        return Math.mulDiv(shares, indexRay, DEBT_DENOMINATOR, Math.Rounding.Ceil);
    }

    function repaySharesBurn(uint256 maxAssets, uint256 ownerShares, uint256 indexRay)
        internal
        pure
        returns (uint256 sharesBurn)
    {
        if (maxAssets == 0 || ownerShares == 0) return 0;
        if (indexRay == 0) revert InvalidShareState();
        sharesBurn = Math.mulDiv(maxAssets, DEBT_DENOMINATOR, indexRay);
        if (sharesBurn > ownerShares) sharesBurn = ownerShares;
    }

    function repayAssetsPaid(uint256 sharesBurn, uint256 indexRay) internal pure returns (uint256) {
        if (sharesBurn == 0) return 0;
        if (indexRay == 0) revert InvalidShareState();
        return Math.mulDiv(sharesBurn, indexRay, DEBT_DENOMINATOR, Math.Rounding.Ceil);
    }

    /// @dev Largest owned share amount whose rounded asset payout does not exceed cash.
    function maxRedeemShares(
        uint256 ownedShares,
        uint256 totalShares,
        uint256 assets,
        uint256 cash,
        uint256 performingDebt
    ) internal pure returns (uint256 limited) {
        if (ownedShares == 0 || totalShares == 0 || assets == 0) return 0;
        limited = ownedShares;
        uint256 payout = Math.mulDiv(limited, assets, totalShares);
        if (payout > cash) {
            uint256 plusOne = cash + 1;
            uint256 num = Math.mulDiv(plusOne, totalShares, 1);
            if (num == 0) return 0;
            limited = (num - 1) / assets;
            if (limited > ownedShares) limited = ownedShares;
            while (limited > 0 && Math.mulDiv(limited, assets, totalShares) > cash) {
                unchecked {
                    limited--;
                }
            }
            while (
                limited < ownedShares && Math.mulDiv(limited + 1, assets, totalShares) <= cash
            ) {
                unchecked {
                    limited++;
                }
            }
        }
        if (limited == totalShares && performingDebt > 0 && limited > 0) {
            unchecked {
                limited--;
            }
            while (limited > 0 && Math.mulDiv(limited, assets, totalShares) > cash) {
                unchecked {
                    limited--;
                }
            }
        }
    }

    /// @dev Largest assets amount satisfying share ownership and `assets <= cash`.
    ///      Inverse of ceil-burn plus a few units of boundary correction — not a percentage.
    ///      Never burns every share while performing debt remains.
    function maxWithdrawAssets(
        uint256 ownedShares,
        uint256 totalShares,
        uint256 assets,
        uint256 cash,
        uint256 performingDebt
    ) internal pure returns (uint256 amount) {
        if (ownedShares == 0 || totalShares == 0 || assets == 0 || cash == 0) return 0;
        amount = supplierClaim(ownedShares, totalShares, assets);
        if (amount > cash) amount = cash;
        if (performingDebt > 0) {
            uint256 capKeepClaimant = Math.mulDiv(totalShares - 1, assets, totalShares);
            if (amount > capKeepClaimant) amount = capKeepClaimant;
        }
        while (amount > 0) {
            uint256 burn_ = Math.mulDiv(amount, totalShares, assets, Math.Rounding.Ceil);
            bool burnsAllWithDebt = burn_ == totalShares && performingDebt > 0;
            if (burn_ <= ownedShares && !burnsAllWithDebt) break;
            unchecked {
                amount--;
            }
        }
    }
}
