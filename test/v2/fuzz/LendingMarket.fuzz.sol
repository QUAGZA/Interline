// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MarketFixture} from "../fixtures/MarketFixture.sol";
import {LendingMarket} from "../../../src/v2/LendingMarket.sol";
import {LiquidationMath} from "../../../src/v2/libraries/LiquidationMath.sol";
import {PriceMath} from "../../../src/v2/libraries/PriceMath.sol";
import {IMarketOracle} from "../../../src/v2/interfaces/IMarketOracle.sol";

contract LendingMarketFuzzTest is MarketFixture {
    function setUp() public {
        _deployWalletMarket();
        _fund(alice, 1_000_000e6, 0);
        _fund(bob, 0, 500 ether);
        _supply(alice, 500_000e6);
        _collateral(bob, 100 ether);
    }

    function testFuzz_SupplyWithdrawRoundTrip(uint128 raw) public {
        uint256 amount = bound(uint256(raw), MIN_SUPPLY, 100_000e6);
        _fund(carol, amount, 0);
        uint256 before = musdc.balanceOf(carol);
        _supply(carol, amount);
        uint256 maxW = market.maxWithdraw(carol);
        vm.prank(carol);
        market.withdraw(maxW, type(uint256).max);
        assertLe(before - musdc.balanceOf(carol), 1);
    }

    function testFuzz_BorrowRepay(uint128 raw) public {
        uint256 amount = bound(uint256(raw), MIN_BORROW, 50_000e6);
        uint256 maxB = market.maxBorrow(bob);
        amount = bound(amount, MIN_BORROW, maxB);
        _borrow(bob, amount);
        uint256 debt = market.positionDebt(bob);
        musdc.mint(bob, debt);
        vm.prank(bob);
        market.repayAll(bob, debt);
        assertEq(market.positionDebt(bob), 0);
    }

    function testFuzz_RepayAllAfterTime(uint32 dt, uint128 raw) public {
        uint256 maxB = market.maxBorrow(bob);
        if (maxB < MIN_BORROW) return;
        uint256 amount = bound(uint256(raw), MIN_BORROW, maxB);
        _borrow(bob, amount);
        vm.warp(block.timestamp + bound(uint256(dt), 1, 365 days));
        uint256 debt = market.positionDebt(bob);
        musdc.mint(bob, debt);
        vm.prank(bob);
        market.repayAll(bob, debt);
        assertEq(market.positionDebt(bob), 0);
        assertEq(market.debtSharesOf(bob), 0);
    }

    function testFuzz_WithdrawRespectsMax(uint128 raw) public {
        uint256 amount = bound(uint256(raw), MIN_SUPPLY, 80_000e6);
        _fund(carol, amount, 0);
        _supply(carol, amount);
        uint256 maxW = market.maxWithdraw(carol);
        vm.prank(carol);
        vm.expectRevert();
        market.withdraw(maxW + 1, type(uint256).max);
        assertLe(market.accountedCash(), musdc.balanceOf(address(market)));
    }

    function testFuzz_DonationDoesNotChangeClaim(uint128 raw) public {
        uint256 shares = market.supplySharesOf(alice);
        uint256 cash = market.accountedCash();
        uint256 donation = bound(uint256(raw), 1, 1_000_000e6);
        musdc.mint(address(market), donation);
        assertEq(market.supplySharesOf(alice), shares);
        assertEq(market.accountedCash(), cash);
        assertGe(market.unaccountedSurplus(), donation);
        assertLe(cash, musdc.balanceOf(address(market)));
    }

    function testFuzz_HealthyLiquidateReverts(uint128 raw) public {
        uint256 maxB = market.maxBorrow(bob);
        if (maxB < MIN_BORROW) return;
        uint256 amount = bound(uint256(raw), MIN_BORROW, maxB);
        _borrow(bob, amount);
        _fund(carol, 1_000_000e6, 0);
        uint256 shares = market.debtSharesOf(bob);
        vm.prank(carol);
        vm.expectRevert(LendingMarket.Healthy.selector);
        market.liquidate(bob, shares, 0, type(uint256).max, 0);
        (,,,,, bool liquidatable) = market.healthOf(bob);
        assertFalse(liquidatable);
    }

    function testFuzz_BorrowRespectsMax(uint128 raw) public {
        uint256 maxB = market.maxBorrow(bob);
        if (maxB < MIN_BORROW) return;
        uint256 over = bound(uint256(raw), maxB + 1, maxB + 1_000_000e6);
        vm.prank(bob);
        vm.expectRevert();
        market.borrow(over, type(uint256).max);
    }

    function testFuzz_PartialRepayDust(uint128 raw) public {
        uint256 maxB = market.maxBorrow(bob);
        if (maxB < 20e6) return;
        uint256 amount = bound(uint256(raw), 20e6, maxB);
        _borrow(bob, amount);
        uint256 leave = 1e6;
        uint256 repayAmt = amount - leave;
        vm.prank(bob);
        vm.expectRevert(LendingMarket.DustDebt.selector);
        market.repay(bob, repayAmt);
    }

    function testFuzz_LiquidationBothModesBounded(uint128 priceRaw, bool exactDebt) public {
        uint256 maxB = market.maxBorrow(bob);
        if (maxB < MIN_BORROW) return;
        _borrow(bob, bound(maxB / 2, MIN_BORROW, maxB));
        uint256 price = bound(uint256(priceRaw), 100e8, 1_900e8);
        wethFeed.setAnswer(int256(uint256(price)));
        (,,,,, bool liquidatable) = market.healthOf(bob);
        if (!liquidatable) return;
        _fund(carol, 1_000_000e6, 0);
        uint256 shares = market.debtSharesOf(bob);
        uint256 col = market.collateralOf(bob);
        uint256 beforeLoan = musdc.balanceOf(carol);
        vm.prank(carol);
        if (exactDebt) {
            market.liquidate(bob, shares, 0, type(uint256).max, 0);
        } else {
            market.liquidate(bob, 0, col, type(uint256).max, 0);
        }
        uint256 paid = beforeLoan - musdc.balanceOf(carol);
        uint256 seized = mweth.balanceOf(carol);
        IMarketOracle.Quote memory oq = oracle.quote();
        bool capped = market.debtSharesOf(bob) == 0 && !market.defaulted(bob);
        uint256 seizedValue = PriceMath.collateralValueLoan(seized, oq.quoteScale36);
        assertLe(seizedValue, LiquidationMath.maxSeizedValueLoan(paid, oq.quoteScale36, 500, capped));
        if (capped) {
            uint256 residual = market.collateralOf(bob);
            if (residual > 0) {
                vm.prank(bob);
                market.removeCollateral(residual);
                assertEq(market.collateralOf(bob), 0);
            }
        }
    }
}
