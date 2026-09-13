// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {InterestMath} from "../../../../src/v2/libraries/InterestMath.sol";
import {ShareMath} from "../../../../src/v2/libraries/ShareMath.sol";
import {PriceMath} from "../../../../src/v2/libraries/PriceMath.sol";
import {LiquidationMath} from "../../../../src/v2/libraries/LiquidationMath.sol";
import {MathHarness} from "../../fixtures/MathHarness.sol";

contract GoldenMathTest is Test {
    MathHarness internal h;
    string internal golden;
    uint256 internal constant RAY = 1e27;
    uint256 internal constant YEAR = 31_536_000;
    uint256 internal constant WAD = 1e18;
    uint256 internal constant DENOM = 1e54;

    function setUp() public {
        h = new MathHarness();
        golden = vm.readFile(string.concat(vm.projectRoot(), "/packages/math/test/golden-vectors.json"));
    }

    function g(string memory key) internal view returns (uint256) {
        return vm.parseUint(vm.parseJsonString(golden, string.concat(".", key)));
    }
}

contract InterestMathTest is GoldenMathTest {
    function test_RateCurveReferencePoints() public view {
        assertEq(h.borrowAprRay(0), g("apr0"));
        assertEq(h.borrowAprRay(4e26), g("apr40"));
        assertEq(h.borrowAprRay(8e26), g("apr80"));
        assertEq(h.borrowAprRay(9e26), g("apr90"));
        assertEq(h.borrowAprRay(RAY), g("apr100"));
    }

    function test_RpowGoldenVectors() public view {
        assertEq(h.rpow(0, 0, RAY), RAY);
        assertEq(h.rpow(0, 5, RAY), 0);
        assertEq(h.rpow(RAY, 100, RAY), RAY);
        assertEq(h.rpow(RAY + 1, 0, RAY), RAY);
        assertEq(h.rpow(RAY + 1, 2, RAY), g("rpowRayPlus1Exp2"));
        assertEq(h.rpow(RAY + 1, 10, RAY), g("rpowRayPlus1Exp10"));
    }

    function test_ProjectIndexDtZero() public view {
        assertEq(h.projectIndex(RAY, 2e25, 100, 100), RAY);
    }

    function test_ProjectIndexInvalidTime() public {
        vm.expectRevert(InterestMath.InvalidTime.selector);
        h.projectIndex(RAY, 2e25, 10, 9);
    }

    function test_UtilizationZeroAssets() public view {
        assertEq(h.utilizationRay(0, 0), 0);
        assertEq(h.utilizationRay(100, 0), 0);
        assertEq(h.utilizationRay(100, 100), RAY / 2);
    }

    function test_RatePerSecondFloor() public view {
        assertEq(h.ratePerSecondRay(RAY), g("rpsMax"));
        assertEq(h.ratePerSecondRay(YEAR - 1), 0);
    }

    function test_IndexGoldenVectors() public view {
        assertEq(h.projectIndex(RAY, RAY, 0, 1), g("idx1sMax"));
        assertEq(h.projectIndex(RAY, RAY, 0, YEAR), g("idx1yMax"));
        assertEq(h.projectIndex(RAY, 2e25, 0, YEAR), g("idx1yBase"));
        assertEq(h.borrowApyGrowthRay(1e26), g("borrowApyGrowth10pct"));
        assertEq(h.supplyAprRay(1e26, 8e26), g("supplyApr80"));
        assertEq(h.supplyApyEstGrowthRay(1e26, 8e26), g("supplyApyGrowth80"));
    }

    function test_TenYearMaxRateDormancy() public view {
        uint256 index = h.projectIndex(RAY, RAY, 0, YEAR * 10);
        assertEq(index, g("idx10yMax"));
        uint256 Q = g("maxDebtShares800k");
        uint256 debt = h.debtFromShares(Q, index);
        assertEq(debt, g("debt10yMaxCaps"));
        uint256 cash = 1_000_000e6 - 800_000e6;
        assertEq(cash + debt, g("assets10yMaxCaps"));
        assertLt(index, RAY * 1e6);
    }
}

contract ShareMathTest is GoldenMathTest {
    uint256 internal constant SCALE = 1e12;

    function test_EmptyMarketMint() public view {
        assertEq(h.mintSupplyShares(1e6, 0, 0), g("emptyMint1e6"));
        assertEq(h.mintSupplyShares(1e6, 0, 0), 1e6 * SCALE);
    }

    function test_FloorSupplyCeilWithdraw() public view {
        assertEq(h.mintSupplyShares(100, 1000, 300), g("floorSupply"));
        assertEq(h.withdrawSharesBurn(100, 1000, 300), g("ceilWithdraw"));
        assertEq(h.redeemAssetsOut(333, 1000, 300), 99);
        assertEq(h.supplierClaim(1000, 1000, 300), 300);
    }

    function test_RejectZeroShares() public {
        vm.expectRevert(ShareMath.ZeroShares.selector);
        h.mintSupplyShares(1, 1, 2);
    }

    function test_BorrowCeilRepayFloor() public view {
        uint256 borrowShares = h.borrowDebtShares(1e6, RAY);
        assertEq(borrowShares, 1e6 * DENOM / RAY);
        uint256 debt = h.debtFromShares(borrowShares, RAY);
        assertGe(debt, 1e6);
        uint256 repayShares = h.repaySharesBurn(1e6, borrowShares, RAY);
        assertLe(repayShares, borrowShares);
    }

    function test_RepayAllExactRemaining() public view {
        uint256 index = RAY + 12345;
        uint256 q = 999_999_999_999;
        uint256 paid = h.repayAssetsPaid(q, index);
        uint256 burned = h.repaySharesBurn(paid, q, index);
        assertEq(burned, q);
        assertEq(paid, h.debtFromShares(q, index));
    }

    function test_MaxRedeemWithdrawLiquidity() public view {
        assertEq(h.maxRedeemShares(1000, 1000, 300, 100, 0), 336);
        assertEq(h.maxWithdrawAssets(1000, 1000, 300, 100, 0), 100);
        assertEq(h.redeemAssetsOut(336, 1000, 300), 100);
        assertLe(h.withdrawSharesBurn(100, 1000, 300), 1000);
    }

    function test_MaxRedeemKeepsClaimantWhenDebt() public view {
        assertEq(h.maxRedeemShares(1000, 1000, 300, 300, 1), 999);
        assertEq(h.maxWithdrawAssets(1000, 1000, 300, 300, 1), 299);
        assertLt(h.redeemAssetsOut(999, 1000, 300), 300);
    }
}

contract PriceMathTest is GoldenMathTest {
    function test_WethUsdcQuote() public view {
        uint256 scale = h.quoteScale36(2000e18, 1e18, 18, 6);
        assertEq(scale, g("wethUsdcScale"));
        assertEq(h.collateralValueLoan(1 ether, scale), g("wethUsdcValue1"));
        assertEq(h.borrowCapacity(g("wethUsdcValue1"), 7000), g("ltv70of2000e6"));
        assertEq(h.borrowCapacity(g("wethUsdcValue1"), 8000), g("lt80of2000e6"));
        assertEq(h.liquidationCapacity(g("wethUsdcValue1"), 8000), g("lt80of2000e6"));
        assertEq(h.liquidationCapacity(g("wethUsdcValue1"), 9000), 1800e6);
        assertEq(h.healthFactorWad(g("lt80of2000e6"), g("ltv70of2000e6")), g("hf1400on1600"));
        assertTrue(h.originationAllowed(g("ltv70of2000e6"), g("ltv70of2000e6")));
        assertFalse(h.originationAllowed(g("ltv70of2000e6") + 1, g("ltv70of2000e6")));
    }

    function test_SameDecimalQuote() public view {
        uint256 scale = h.quoteScale36(1e18, 1e18, 6, 6);
        assertEq(h.collateralValueLoan(1e6, scale), 1e6);
    }

    function test_InvalidDecimals() public {
        vm.expectRevert(PriceMath.InvalidDecimals.selector);
        h.quoteScale36(1e18, 1e18, 5, 6);
        vm.expectRevert(PriceMath.InvalidDecimals.selector);
        h.quoteScale36(1e18, 1e18, 18, 19);
    }

    function test_HfBoundaryEqualityHealthy() public view {
        uint256 cap = 100e6;
        assertEq(h.healthFactorWad(cap, cap), WAD);
        assertFalse(h.isLiquidatable(cap, cap));
        assertTrue(h.isLiquidatable(cap + 1, cap));
        (PriceMath.HealthCode code, uint256 hf, bool liq) = h.evaluateHealth(cap, cap, true);
        assertEq(uint256(code), uint256(PriceMath.HealthCode.OK));
        assertEq(hf, WAD);
        assertFalse(liq);
        (code, hf, liq) = h.evaluateHealth(cap, 0, true);
        assertEq(uint256(code), uint256(PriceMath.HealthCode.NO_DEBT));
        assertEq(hf, 0);
        assertFalse(liq);
        (code, hf, liq) = h.evaluateHealth(cap, cap + 1, false);
        assertEq(uint256(code), uint256(PriceMath.HealthCode.UNAVAILABLE));
        assertFalse(liq);
    }
}

contract LiquidationMathTest is GoldenMathTest {
    function test_BothQuoteModes() public view {
        uint256 scale = h.quoteScale36(2000e18, 1e18, 18, 6);
        uint256 shares = g("liq100e6Shares");
        LiquidationMath.Quote memory a = h.quoteLiq(shares, 0, shares, 1 ether, RAY, scale, 500);
        assertEq(a.loanAssetsIn, g("liq100e6LoanIn"));
        assertEq(a.collateralOut, g("liq100e6CollatOut"));
        LiquidationMath.Quote memory b = h.quoteLiq(0, a.collateralOut, shares, 1 ether, RAY, scale, 500);
        assertGt(b.debtSharesBurned, 0);
        assertEq(h.maxLoanAssetsIn(shares, 1 ether, RAY, scale, 500), a.loanAssetsIn);
        assertEq(h.minCollateralOut(shares, 1 ether, RAY, scale, 500), a.collateralOut);
    }

    function test_XorModeReverts() public {
        uint256 scale = h.quoteScale36(2000e18, 1e18, 18, 6);
        vm.expectRevert(LiquidationMath.InvalidQuoteMode.selector);
        h.quoteLiq(1, 1, 10, 1 ether, RAY, scale, 500);
        vm.expectRevert(LiquidationMath.InvalidQuoteMode.selector);
        h.quoteLiq(0, 0, 10, 1 ether, RAY, scale, 500);
    }

    function test_WriteOffWhenCollateralExhausted() public view {
        uint256 scale = h.quoteScale36(2000e18, 1e18, 18, 6);
        uint256 shares = g("liq100e6Shares") * 100;
        uint256 dust = 1e15;
        LiquidationMath.Quote memory q = h.quoteLiq(shares / 2, 0, shares, dust, RAY, scale, 500);
        assertEq(q.collateralOut, dust);
        assertTrue(q.writesOff);
    }

    function test_ExactCollateralDebtCapMatchesFullClose() public view {
        uint256 scale = h.quoteScale36(1550e18, 1e18, 18, 6);
        uint256 shares = h.borrowDebtShares(1_400e6, RAY);
        LiquidationMath.Quote memory debtQ = h.quoteLiq(shares, 0, shares, 1 ether, RAY, scale, 500);
        LiquidationMath.Quote memory colQ = h.quoteLiq(0, 1 ether, shares, 1 ether, RAY, scale, 500);
        assertEq(debtQ.debtSharesBurned, shares);
        assertEq(colQ.debtSharesBurned, shares);
        assertEq(debtQ.loanAssetsIn, colQ.loanAssetsIn);
        assertEq(debtQ.collateralOut, colQ.collateralOut);
        assertLt(colQ.collateralOut, 1 ether);
        assertFalse(colQ.writesOff);
        _assertSeizedBound(colQ, shares, scale, 500);
        _assertSeizedBound(debtQ, shares, scale, 500);
    }

    function test_InsolventExactCollateralWritesOffAndBoundsBonus() public view {
        uint256 scale = h.quoteScale36(1000e18, 1e18, 18, 6);
        uint256 shares = h.borrowDebtShares(1_400e6, RAY);
        LiquidationMath.Quote memory colQ = h.quoteLiq(0, 1 ether, shares, 1 ether, RAY, scale, 500);
        LiquidationMath.Quote memory debtQ = h.quoteLiq(shares, 0, shares, 1 ether, RAY, scale, 500);
        assertTrue(colQ.writesOff);
        assertEq(colQ.collateralOut, 1 ether);
        assertLt(colQ.debtSharesBurned, shares);
        assertEq(debtQ.collateralOut, 1 ether);
        _assertSeizedBound(colQ, shares, scale, 500);
        _assertSeizedBound(debtQ, shares, scale, 500);
    }

    function test_SolventLiquidatablePartialExactCollateral() public view {
        uint256 scale = h.quoteScale36(1550e18, 1e18, 18, 6);
        uint256 shares = h.borrowDebtShares(1_400e6, RAY);
        uint256 half = 0.4 ether;
        LiquidationMath.Quote memory q = h.quoteLiq(0, half, shares, 1 ether, RAY, scale, 500);
        assertLt(q.debtSharesBurned, shares);
        assertEq(q.collateralOut, half);
        assertFalse(q.writesOff);
        _assertSeizedBound(q, shares, scale, 500);
    }

    function testFuzz_BothQuoteModesSeizedValueBounded(
        uint128 ownerCollatRaw,
        uint128 debtAssetsRaw,
        uint128 requestRaw,
        uint256 indexRaw,
        uint256 priceUsdRaw,
        uint16 bonusRaw,
        bool exactDebt
    ) public view {
        uint256 ownerCollat = bound(uint256(ownerCollatRaw), 1e15, 100 ether);
        uint256 debtAssets = bound(uint256(debtAssetsRaw), 1e6, 500_000e6);
        uint256 indexRay = bound(indexRaw, RAY, RAY * 1_000);
        uint256 priceUsd = bound(priceUsdRaw, 1e18, 10_000e18);
        uint16 bonusBps = uint16(bound(uint256(bonusRaw), 0, 2_000));
        uint256 scale = h.quoteScale36(priceUsd, 1e18, 18, 6);
        uint256 shares = h.borrowDebtShares(debtAssets, indexRay);
        if (exactDebt) {
            uint256 reqShares = bound(uint256(requestRaw), 1, shares);
            LiquidationMath.Quote memory q = h.quoteLiq(reqShares, 0, shares, ownerCollat, indexRay, scale, bonusBps);
            _assertSeizedBound(q, shares, scale, bonusBps);
        } else {
            uint256 reqCollat = bound(uint256(requestRaw), 1, ownerCollat);
            try h.quoteLiq(0, reqCollat, shares, ownerCollat, indexRay, scale, bonusBps) returns (
                LiquidationMath.Quote memory q
            ) {
                _assertSeizedBound(q, shares, scale, bonusBps);
                if (q.debtSharesBurned == shares) {
                    assertLe(q.collateralOut, reqCollat);
                    LiquidationMath.Quote memory full = h.quoteFullClose(shares, ownerCollat, indexRay, scale, bonusBps);
                    assertEq(q.loanAssetsIn, full.loanAssetsIn);
                    assertEq(q.collateralOut, full.collateralOut);
                    assertFalse(q.writesOff);
                }
            } catch {}
        }
    }

    function _assertSeizedBound(LiquidationMath.Quote memory q, uint256 ownerShares, uint256 scale, uint16 bonus)
        internal
        view
    {
        bool capped = q.debtSharesBurned == ownerShares;
        uint256 seizedValue = h.collateralValueLoan(q.collateralOut, scale);
        assertLe(seizedValue, h.maxSeizedValueLoan(q.loanAssetsIn, scale, bonus, capped));
    }
}
