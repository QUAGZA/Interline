// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {MarketFixture} from "../fixtures/MarketFixture.sol";
import {LendingMarket} from "../../../src/v2/LendingMarket.sol";
import {MarketLens} from "../../../src/v2/MarketLens.sol";
import {ILendingMarket} from "../../../src/v2/interfaces/ILendingMarket.sol";
import {IMarketRecoveryEscrow} from "../../../src/v2/interfaces/IMarketRecoveryEscrow.sol";
import {PriceMath} from "../../../src/v2/libraries/PriceMath.sol";
import {InterestMath} from "../../../src/v2/libraries/InterestMath.sol";
import {ShareMath} from "../../../src/v2/libraries/ShareMath.sol";
import {LiquidationMath} from "../../../src/v2/libraries/LiquidationMath.sol";
import {TestnetFaucet} from "../../../src/v2/mocks/TestnetFaucet.sol";
import {IMarketOracle} from "../../../src/v2/interfaces/IMarketOracle.sol";

contract LendingMarketTest is MarketFixture {
    function setUp() public {
        _deployWalletMarket();
    }

    function test_ThreeSuppliersThreeBorrowers() public {
        _fund(alice, 200_000e6, 0);
        _fund(bob, 200_000e6, 0);
        _fund(carol, 200_000e6, 0);
        _fund(dave, 0, 50 ether);
        _fund(eve, 0, 50 ether);
        _fund(frank, 0, 50 ether);

        _supply(alice, 100_000e6);
        _supply(bob, 80_000e6);
        _supply(carol, 50_000e6);

        _collateral(dave, 10 ether);
        _collateral(eve, 10 ether);
        _collateral(frank, 10 ether);

        _borrow(dave, 5_000e6);
        _borrow(eve, 4_000e6);
        _borrow(frank, 3_000e6);

        assertEq(musdc.balanceOf(dave), 5_000e6);
        assertEq(musdc.balanceOf(eve), 4_000e6);
        assertEq(musdc.balanceOf(frank), 3_000e6);
        assertEq(market.accountedCash(), 230_000e6 - 12_000e6);
        assertGt(market.aggregateDebt(), 0);
    }

    function test_SameWalletSupplyAndBorrow() public {
        _fund(alice, 100_000e6, 5 ether);
        _supply(alice, 50_000e6);
        _collateral(alice, 5 ether);
        _borrow(alice, 1_000e6);
        assertEq(musdc.balanceOf(alice), 100_000e6 - 50_000e6 + 1_000e6);
        assertGt(market.supplySharesOf(alice), 0);
        assertGt(market.debtSharesOf(alice), 0);
        assertEq(mweth.balanceOf(address(market)), 5 ether);
    }

    function test_IsolationAcrossTwoMarkets() public {
        LendingMarket other = new LendingMarket(
            ILendingMarket.Init({
                loanToken: address(musdc),
                collateralToken: address(mweth),
                oracle: address(oracle),
                maxLtvBps: 8000,
                liquidationThresholdBps: 9000,
                liquidationBonusBps: 500,
                supplyCap: SUPPLY_CAP,
                borrowCap: BORROW_CAP,
                deliveryMode: ILendingMarket.DeliveryMode.Wallet,
                defaultPositionCap: BORROW_CAP,
                recallWindow: 300,
                recoveryDelay: 300,
                minBorrow: MIN_BORROW,
                minSupply: MIN_SUPPLY,
                curator: curator,
                guardian: guardian,
                vaultFactory: address(0),
                recoveryEscrow: address(0)
            })
        );
        _fund(alice, 50_000e6, 0);
        _supply(alice, 20_000e6);
        vm.startPrank(alice);
        musdc.approve(address(other), type(uint256).max);
        other.supply(10_000e6, 0);
        vm.stopPrank();
        _fund(bob, 0, 10 ether);
        vm.startPrank(bob);
        mweth.approve(address(other), type(uint256).max);
        market.addCollateral(bob, 5 ether);
        other.addCollateral(bob, 3 ether);
        market.borrow(1_000e6, type(uint256).max);
        vm.stopPrank();

        assertEq(market.accountedCash(), 19_000e6);
        assertEq(other.accountedCash(), 10_000e6);
        assertEq(market.collateralOf(bob), 5 ether);
        assertEq(other.collateralOf(bob), 3 ether);
        assertEq(other.aggregateDebt(), 0);
        assertEq(other.positionDebt(bob), 0);
        assertEq(musdc.balanceOf(address(other)), 10_000e6);
        assertEq(mweth.balanceOf(address(other)), 3 ether);
    }

    function test_RepayAllClearsDebt() public {
        _fund(alice, 100_000e6, 0);
        _fund(bob, 0, 5 ether);
        _supply(alice, 50_000e6);
        _collateral(bob, 5 ether);
        _borrow(bob, 1_000e6);
        vm.warp(block.timestamp + 30 days);
        uint256 debt = market.positionDebt(bob);
        musdc.mint(bob, debt);
        vm.startPrank(bob);
        market.repayAll(bob, debt + 1e6);
        vm.stopPrank();
        assertEq(market.debtSharesOf(bob), 0);
        assertEq(market.positionDebt(bob), 0);
        assertEq(market.totalDebtShares(), 0);
        assertEq(market.aggregateDebt(), 0);
    }

    function test_HfBoundaryViaOracle() public {
        _fund(alice, 200_000e6, 0);
        _fund(bob, 0, 1 ether);
        _supply(alice, 200_000e6);
        _collateral(bob, 1 ether);
        _borrow(bob, 1_440e6);
        wethFeed.setAnswer(1600e8);
        (PriceMath.HealthCode code, uint256 hf, uint256 debt, uint256 liqCap,, bool liquidatable) = market.healthOf(bob);
        assertEq(uint256(code), uint256(PriceMath.HealthCode.OK));
        assertEq(debt, 1_440e6);
        assertEq(liqCap, 1_440e6);
        assertEq(hf, 1e18);
        assertFalse(liquidatable);
        wethFeed.setAnswer(1599e8);
        (,,,,, liquidatable) = market.healthOf(bob);
        assertTrue(liquidatable);
    }

    function test_LiquidationExactDebtShares() public {
        _fund(alice, 200_000e6, 0);
        _fund(bob, 0, 1 ether);
        _fund(carol, 2_000e6, 0);
        _supply(alice, 200_000e6);
        _collateral(bob, 1 ether);
        _borrow(bob, 1_400e6);
        wethFeed.setAnswer(1_000e8);
        uint256 shares = market.debtSharesOf(bob);
        uint256 cashBefore = musdc.balanceOf(carol);
        vm.prank(carol);
        market.liquidate(bob, shares, 0, type(uint256).max, 0);
        assertEq(market.debtSharesOf(bob), 0);
        assertLt(musdc.balanceOf(carol), cashBefore);
        assertGt(mweth.balanceOf(carol), 0);
    }

    function test_LiquidationExactCollateral() public {
        _fund(alice, 200_000e6, 0);
        _fund(bob, 0, 1 ether);
        _fund(carol, 2_000e6, 0);
        _supply(alice, 200_000e6);
        _collateral(bob, 1 ether);
        _borrow(bob, 1_400e6);
        wethFeed.setAnswer(1_000e8);
        uint256 col = market.collateralOf(bob);
        vm.prank(carol);
        market.liquidate(bob, 0, col / 2, type(uint256).max, 0);
        assertLt(market.collateralOf(bob), col);
        assertGt(market.debtSharesOf(bob), 0);
    }

    function test_LiquidationExactCollateralDebtCapLeavesResidual() public {
        _openSolventLiquidatable();
        uint256 beforeLoan = musdc.balanceOf(carol);
        vm.prank(carol);
        market.liquidate(bob, 0, 1 ether, type(uint256).max, 0);
        _assertFullCloseLeavesResidual(beforeLoan);
    }

    function test_LiquidationExactDebtSharesSolventLeavesResidual() public {
        _openSolventLiquidatable();
        uint256 shares = market.debtSharesOf(bob);
        uint256 beforeLoan = musdc.balanceOf(carol);
        vm.prank(carol);
        market.liquidate(bob, shares, 0, type(uint256).max, 0);
        _assertFullCloseLeavesResidual(beforeLoan);
    }

    function test_LiquidationInsolventExactCollateralWritesOff() public {
        _fund(alice, 200_000e6, 0);
        _fund(bob, 0, 1 ether);
        _fund(carol, 2_000e6, 0);
        _supply(alice, 200_000e6);
        _collateral(bob, 1 ether);
        _borrow(bob, 1_400e6);
        wethFeed.setAnswer(1_000e8);
        uint256 beforeLoan = musdc.balanceOf(carol);
        vm.prank(carol);
        market.liquidate(bob, 0, 1 ether, type(uint256).max, 0);
        uint256 paid = beforeLoan - musdc.balanceOf(carol);
        assertTrue(market.defaulted(bob));
        assertEq(market.collateralOf(bob), 0);
        assertEq(market.debtSharesOf(bob), 0);
        assertLt(paid, 1_400e6);
        IMarketOracle.Quote memory oq = oracle.quote();
        uint256 seizedValue = PriceMath.collateralValueLoan(mweth.balanceOf(carol), oq.quoteScale36);
        assertLe(seizedValue, LiquidationMath.maxSeizedValueLoan(paid, oq.quoteScale36, 500, false));
    }

    function _openSolventLiquidatable() internal {
        _fund(alice, 10_000e6, 0);
        _fund(bob, 0, 1 ether);
        _fund(carol, 10_000e6, 0);
        _supply(alice, 10_000e6);
        _collateral(bob, 1 ether);
        _borrow(bob, 1_400e6);
        wethFeed.setAnswer(1_550e8);
        (,,,,, bool liquidatable) = market.healthOf(bob);
        assertTrue(liquidatable);
    }

    function _assertFullCloseLeavesResidual(uint256 beforeLoan) internal {
        uint256 paid = beforeLoan - musdc.balanceOf(carol);
        uint256 seized = mweth.balanceOf(carol);
        assertEq(paid, 1_400e6);
        assertEq(market.debtSharesOf(bob), 0);
        assertFalse(market.defaulted(bob));
        assertLt(seized, 1 ether);
        uint256 residual = market.collateralOf(bob);
        assertGt(residual, 0);
        IMarketOracle.Quote memory oq = oracle.quote();
        uint256 seizedValue = PriceMath.collateralValueLoan(seized, oq.quoteScale36);
        assertLe(seizedValue, LiquidationMath.maxSeizedValueLoan(paid, oq.quoteScale36, 500, true));
        uint256 bobWethBefore = mweth.balanceOf(bob);
        vm.prank(bob);
        market.removeCollateral(residual);
        assertEq(market.collateralOf(bob), 0);
        assertEq(mweth.balanceOf(bob), bobWethBefore + residual);
    }

    function test_DonationDoesNotRepriceShares() public {
        _fund(alice, 10_000e6, 0);
        musdc.mint(address(market), 500_000e6);
        _supply(alice, 1_000e6);
        assertEq(market.supplySharesOf(alice), 1_000e6 * 1e12);
        assertEq(market.unaccountedSurplus(), 500_000e6);
        assertEq(market.accountedCash(), 1_000e6);
    }

    function test_StaleOracleBlocksBorrowAllowsRepay() public {
        _fund(alice, 50_000e6, 0);
        _fund(bob, 0, 5 ether);
        _supply(alice, 20_000e6);
        _collateral(bob, 5 ether);
        _borrow(bob, 100e6);
        wethFeed.setUpdatedAt(block.timestamp - 10_000);
        vm.prank(bob);
        vm.expectRevert(LendingMarket.OracleInvalid.selector);
        market.borrow(10e6, type(uint256).max);
        uint256 sharesBefore = market.debtSharesOf(bob);
        musdc.mint(bob, 100e6);
        vm.prank(bob);
        market.repay(bob, 50e6);
        assertLt(market.debtSharesOf(bob), sharesBefore);
    }

    function test_AccrualManyShortEqualsOneLong() public {
        _fund(alice, 100_000e6, 0);
        _fund(bob, 0, 10 ether);
        _supply(alice, 50_000e6);
        _collateral(bob, 10 ether);
        _borrow(bob, 10_000e6);
        uint256 epochIndex = market.epochIndexRay();
        uint256 epochApr = market.epochAprRay();
        uint64 epochTs = market.epochTimestamp();
        uint256 end = block.timestamp + 30 days;
        // Incremental skip: via-IR / optimizer-runs=1 can clobber a loop-carried
        // `start` in `warp(start + i * 1 days)`, turning 30 days into T_30 = 465.
        for (uint256 i = 0; i < 30; ++i) {
            skip(1 days);
            market.accrue();
        }
        assertEq(block.timestamp, end);
        assertEq(market.epochIndexRay(), epochIndex);
        assertEq(market.epochAprRay(), epochApr);
        assertEq(market.epochTimestamp(), epochTs);
        assertEq(market.indexNow(), InterestMath.projectIndex(epochIndex, epochApr, epochTs, end));
    }

    function test_CapsNeverBlockRepay() public {
        _fund(alice, 1_000_000e6, 0);
        _fund(bob, 0, 600 ether);
        _supply(alice, 1_000_000e6);
        _collateral(bob, 600 ether);
        _borrow(bob, 800_000e6);
        vm.warp(block.timestamp + 365 days);
        uint256 debt = market.positionDebt(bob);
        assertGt(debt, 800_000e6);
        musdc.mint(bob, debt);
        vm.prank(bob);
        market.repayAll(bob, debt);
        assertEq(market.positionDebt(bob), 0);
    }

    function test_WithdrawLiquidityLimited() public {
        _fund(alice, 50_000e6, 0);
        _fund(bob, 0, 40 ether);
        _supply(alice, 50_000e6);
        _collateral(bob, 40 ether);
        _borrow(bob, 40_000e6);
        uint256 maxW = market.maxWithdraw(alice);
        assertEq(maxW, market.accountedCash());
        vm.prank(alice);
        vm.expectRevert(LendingMarket.InsufficientCash.selector);
        market.withdraw(50_000e6, type(uint256).max);
        vm.prank(alice);
        market.withdraw(maxW, type(uint256).max);
    }

    function test_ThirdPartyRepayNoRights() public {
        _fund(alice, 50_000e6, 0);
        _fund(bob, 0, 5 ether);
        _fund(carol, 1_000e6, 0);
        _supply(alice, 20_000e6);
        _collateral(bob, 5 ether);
        _borrow(bob, 500e6);
        vm.prank(carol);
        market.repay(bob, 100e6);
        assertEq(market.supplySharesOf(carol), 0);
        vm.prank(carol);
        vm.expectRevert(LendingMarket.InsufficientShares.selector);
        market.withdraw(1, type(uint256).max);
    }

    function test_HfBoundaryDebtPlusOneLiquidatable() public {
        _fund(alice, 200_000e6, 0);
        _fund(bob, 0, 1 ether);
        _supply(alice, 200_000e6);
        _collateral(bob, 1 ether);
        _borrow(bob, 1_440e6);
        wethFeed.setAnswer(1600e8);
        (,, uint256 debt, uint256 liqCap,, bool liquidatable) = market.healthOf(bob);
        assertEq(debt, liqCap);
        assertFalse(liquidatable);
        vm.warp(block.timestamp + 1);
        (,, debt, liqCap,, liquidatable) = market.healthOf(bob);
        assertGt(debt, liqCap);
        assertTrue(liquidatable);
    }

    function test_StaleOracleOperationMatrix() public {
        _fund(alice, 50_000e6, 0);
        _fund(bob, 0, 6 ether);
        _fund(carol, 1_000e6, 0);
        _supply(alice, 20_000e6);
        _collateral(bob, 5 ether);
        _borrow(bob, 100e6);
        wethFeed.setUpdatedAt(block.timestamp - 10_000);

        vm.prank(alice);
        vm.expectRevert(LendingMarket.OracleInvalid.selector);
        market.supply(1e6, 0);

        vm.prank(bob);
        vm.expectRevert(LendingMarket.OracleInvalid.selector);
        market.borrow(10e6, type(uint256).max);

        vm.prank(bob);
        vm.expectRevert(LendingMarket.OracleInvalid.selector);
        market.removeCollateral(1);

        uint256 liqShares = market.debtSharesOf(bob);
        vm.prank(carol);
        vm.expectRevert(LendingMarket.OracleInvalid.selector);
        market.liquidate(bob, liqShares, 0, type(uint256).max, 0);

        vm.prank(bob);
        market.addCollateral(bob, 1 ether);
        assertEq(market.collateralOf(bob), 6 ether);

        musdc.mint(bob, 50e6);
        uint256 sharesBefore = market.debtSharesOf(bob);
        vm.prank(bob);
        market.repay(bob, 10e6);
        assertLt(market.debtSharesOf(bob), sharesBefore);

        uint256 cashBefore = market.accountedCash();
        vm.prank(alice);
        market.withdraw(1e6, type(uint256).max);
        assertEq(market.accountedCash(), cashBefore - 1e6);
    }

    function test_SequencerDownBlocksBorrowAllowsAddCollateral() public {
        _fund(alice, 20_000e6, 0);
        _fund(bob, 0, 6 ether);
        _supply(alice, 10_000e6);
        _collateral(bob, 5 ether);
        sequencer.setDown(true);
        vm.prank(bob);
        vm.expectRevert(LendingMarket.OracleInvalid.selector);
        market.borrow(10e6, type(uint256).max);
        vm.prank(bob);
        market.addCollateral(bob, 1 ether);
        assertEq(market.collateralOf(bob), 6 ether);

        wethFeed.setRevert(true);
        sequencer.setDown(false);
        sequencer.setStartedAt(1);
        vm.prank(bob);
        vm.expectRevert(LendingMarket.OracleInvalid.selector);
        market.borrow(10e6, type(uint256).max);
        _fund(carol, 0, 1 ether);
        vm.prank(carol);
        market.addCollateral(bob, 1 ether);
        assertEq(market.collateralOf(bob), 7 ether);
    }

    function test_ZeroDebtRemoveCollateralWithoutOracle() public {
        _fund(bob, 0, 2 ether);
        _collateral(bob, 2 ether);
        wethFeed.setUpdatedAt(block.timestamp - 10_000);
        vm.prank(bob);
        market.removeCollateral(2 ether);
        assertEq(market.collateralOf(bob), 0);
    }

    function test_BorrowedTokensAndSupplySharesAreNotCollateral() public {
        _fund(alice, 50_000e6, 1 ether);
        _supply(alice, 50_000e6);
        vm.prank(alice);
        vm.expectRevert(LendingMarket.InsufficientCollateral.selector);
        market.borrow(MIN_BORROW, type(uint256).max);
        _collateral(alice, 1 ether);
        uint256 maxB = market.maxBorrow(alice);
        assertGt(maxB, 0);
        assertLe(maxB, 1_600e6);
        assertEq(maxB, 1_600e6);
        assertEq(market.collateralOf(alice), 1 ether);
    }

    function test_EmptyMarketFirstDepositorThenProportional() public {
        _fund(alice, 2_000e6, 0);
        _fund(bob, 2_000e6, 0);
        musdc.mint(address(market), 100_000e6);
        _supply(alice, 1_000e6);
        _supply(bob, 1_000e6);
        assertEq(market.supplySharesOf(alice), market.supplySharesOf(bob));
        assertEq(market.supplySharesOf(alice), 1_000e6 * 1e12);
        assertEq(market.unaccountedSurplus(), 100_000e6);
    }

    function test_RedeemExactShares() public {
        _fund(alice, 5_000e6, 0);
        _supply(alice, 2_000e6);
        uint256 shares = market.supplySharesOf(alice);
        uint256 before = musdc.balanceOf(alice);
        vm.prank(alice);
        market.redeem(shares, 2_000e6);
        assertEq(musdc.balanceOf(alice), before + 2_000e6);
        assertEq(market.supplySharesOf(alice), 0);
        assertEq(market.totalSupplyShares(), 0);
    }

    function test_PartialRepayDustRevertsFullRepayOk() public {
        _fund(alice, 50_000e6, 0);
        _fund(bob, 0, 5 ether);
        _supply(alice, 20_000e6);
        _collateral(bob, 5 ether);
        _borrow(bob, 100e6);
        vm.prank(bob);
        vm.expectRevert(LendingMarket.DustDebt.selector);
        market.repay(bob, 91e6);
        vm.prank(bob);
        market.repay(bob, 90e6);
        assertEq(market.positionDebt(bob), 10e6);
        vm.prank(bob);
        market.repayAll(bob, 10e6);
        assertEq(market.positionDebt(bob), 0);
    }

    function test_MinBorrowAndMaxBorrowDust() public {
        _fund(alice, 50_000e6, 0);
        _fund(bob, 0, 1 ether);
        _supply(alice, 20_000e6);
        _collateral(bob, 0.005 ether);
        assertEq(market.maxBorrow(bob), 0);
        _collateral(bob, 1 ether - 0.005 ether);
        vm.prank(bob);
        vm.expectRevert(LendingMarket.MinAmount.selector);
        market.borrow(MIN_BORROW - 1, type(uint256).max);
        _borrow(bob, MIN_BORROW);
        assertEq(musdc.balanceOf(bob), MIN_BORROW);
    }

    function test_SupplyCapBlocksSupplyNotWithdraw() public {
        _fund(alice, 1_000_001e6, 0);
        _supply(alice, 1_000_000e6);
        vm.prank(alice);
        vm.expectRevert(LendingMarket.SupplyCapExceeded.selector);
        market.supply(1e6, 0);
        vm.prank(alice);
        market.withdraw(1e6, type(uint256).max);
        assertEq(market.accountedCash(), 999_999e6);
    }

    function test_BorrowCapBlocksBorrowNotLiquidate() public {
        _fund(alice, 1_000_000e6, 0);
        _fund(bob, 0, 600 ether);
        _fund(carol, 900_000e6, 0);
        _supply(alice, 1_000_000e6);
        _collateral(bob, 600 ether);
        _borrow(bob, 800_000e6);
        vm.prank(bob);
        vm.expectRevert(LendingMarket.BorrowCapExceeded.selector);
        market.borrow(MIN_BORROW, type(uint256).max);
        wethFeed.setAnswer(1_000e8);
        uint256 sharesBefore = market.debtSharesOf(bob);
        vm.prank(carol);
        market.liquidate(bob, sharesBefore / 2, 0, type(uint256).max, 0);
        assertLt(market.debtSharesOf(bob), sharesBefore);
        assertGt(market.collateralOf(bob), 0);
    }

    function test_FreezeBlocksNewRiskNotRepayOrCollateral() public {
        _fund(alice, 50_000e6, 0);
        _fund(bob, 0, 6 ether);
        _supply(alice, 20_000e6);
        _collateral(bob, 5 ether);
        _borrow(bob, 100e6);
        vm.prank(guardian);
        market.setBorrowFrozen(true);
        vm.prank(bob);
        vm.expectRevert(LendingMarket.Frozen.selector);
        market.borrow(10e6, type(uint256).max);
        vm.prank(bob);
        market.addCollateral(bob, 1 ether);
        musdc.mint(bob, 100e6);
        vm.prank(bob);
        market.repay(bob, 10e6);
        vm.prank(guardian);
        market.setSupplyFrozen(true);
        vm.prank(alice);
        vm.expectRevert(LendingMarket.Frozen.selector);
        market.supply(1e6, 0);
        vm.prank(alice);
        market.withdraw(1e6, type(uint256).max);
    }

    function test_HealthyLiquidateRevertsAndXorMode() public {
        _fund(alice, 50_000e6, 0);
        _fund(bob, 0, 5 ether);
        _fund(carol, 1_000e6, 0);
        _supply(alice, 20_000e6);
        _collateral(bob, 5 ether);
        _borrow(bob, 100e6);
        uint256 shares = market.debtSharesOf(bob);
        vm.prank(carol);
        vm.expectRevert(LendingMarket.Healthy.selector);
        market.liquidate(bob, shares, 0, type(uint256).max, 0);
        wethFeed.setAnswer(1e8);
        vm.prank(carol);
        vm.expectRevert(LiquidationMath.InvalidQuoteMode.selector);
        market.liquidate(bob, 1, 1, type(uint256).max, 0);
    }

    function test_RemoveCollateralUsesLtvNotLiquidationThreshold() public {
        _fund(alice, 50_000e6, 0);
        _fund(bob, 0, 1 ether);
        _supply(alice, 20_000e6);
        _collateral(bob, 1 ether);
        _borrow(bob, 1_000e6);
        vm.prank(bob);
        vm.expectRevert(LendingMarket.InsufficientCollateral.selector);
        market.removeCollateral(0.375 ether + 1);
        vm.prank(bob);
        market.removeCollateral(0.375 ether);
        assertEq(market.collateralOf(bob), 0.625 ether);
    }

    function test_AccruePokeDoesNotResetEpoch() public {
        _fund(alice, 50_000e6, 0);
        _fund(bob, 0, 10 ether);
        _supply(alice, 20_000e6);
        _collateral(bob, 10 ether);
        _borrow(bob, 5_000e6);
        uint256 epochIndex = market.epochIndexRay();
        uint256 epochApr = market.epochAprRay();
        uint64 epochTs = market.epochTimestamp();
        vm.warp(block.timestamp + 10 days);
        market.accrue();
        assertEq(market.epochIndexRay(), epochIndex);
        assertEq(market.epochAprRay(), epochApr);
        assertEq(market.epochTimestamp(), epochTs);
        assertGt(market.indexNow(), epochIndex);
    }

    function test_CashOpStartsNewEpochWhenAprChanges() public {
        _fund(alice, 100_000e6, 0);
        _fund(bob, 0, 10 ether);
        _supply(alice, 50_000e6);
        uint256 aprBefore = market.epochAprRay();
        uint64 tsBefore = market.epochTimestamp();
        _collateral(bob, 10 ether);
        vm.warp(block.timestamp + 1);
        _borrow(bob, 10_000e6);
        assertTrue(market.epochAprRay() != aprBefore);
        assertEq(market.epochTimestamp(), uint64(block.timestamp));
        assertTrue(market.epochTimestamp() > tsBefore);
        assertEq(market.epochAprRay(), InterestMath.borrowAprRay(market.currentUtilizationRay()));
    }

    function test_WriteOffHookAndNoReopen() public {
        WriteOffHook hook = new WriteOffHook();
        LendingMarket m = new LendingMarket(_walletInit(address(hook)));
        _fund(alice, 200_000e6, 0);
        _fund(bob, 0, 1 ether);
        _fund(carol, 2_000e6, 0);
        vm.startPrank(alice);
        musdc.approve(address(m), type(uint256).max);
        m.supply(200_000e6, 0);
        vm.stopPrank();
        vm.startPrank(bob);
        mweth.approve(address(m), type(uint256).max);
        m.addCollateral(bob, 1 ether);
        m.borrow(1_400e6, type(uint256).max);
        vm.stopPrank();
        vm.prank(carol);
        musdc.approve(address(m), type(uint256).max);
        wethFeed.setAnswer(1_000e8);
        uint256 aliceShares = m.supplySharesOf(alice);
        uint256 col = m.collateralOf(bob);
        vm.prank(carol);
        m.liquidate(bob, 0, col, type(uint256).max, 0);
        assertTrue(m.defaulted(bob));
        assertEq(m.collateralOf(bob), 0);
        assertEq(m.debtSharesOf(bob), 0);
        assertGt(m.writtenOffLiability(bob), 0);
        assertEq(hook.lastOwner(), bob);
        assertGt(hook.lastDebt(), 0);
        assertEq(m.sharesAtSnapshot(alice, m.snapshotId()), aliceShares);
        vm.prank(bob);
        vm.expectRevert(LendingMarket.Defaulted.selector);
        m.borrow(MIN_BORROW, type(uint256).max);
    }

    function test_FeeOnTransferRejected() public {
        FeeOnTransferToken fee = new FeeOnTransferToken();
        LendingMarket fot = new LendingMarket(
            ILendingMarket.Init({
                loanToken: address(fee),
                collateralToken: address(mweth),
                oracle: address(oracle),
                maxLtvBps: 8000,
                liquidationThresholdBps: 9000,
                liquidationBonusBps: 500,
                supplyCap: SUPPLY_CAP,
                borrowCap: BORROW_CAP,
                deliveryMode: ILendingMarket.DeliveryMode.Wallet,
                defaultPositionCap: BORROW_CAP,
                recallWindow: 300,
                recoveryDelay: 300,
                minBorrow: MIN_BORROW,
                minSupply: MIN_SUPPLY,
                curator: curator,
                guardian: guardian,
                vaultFactory: address(0),
                recoveryEscrow: address(0)
            })
        );
        fee.mint(alice, 1_000e6);
        vm.startPrank(alice);
        fee.approve(address(fot), type(uint256).max);
        vm.expectRevert(LendingMarket.FeeOnTransfer.selector);
        fot.supply(100e6, 0);
        vm.stopPrank();
    }

    function test_PrincipalThenInterestOnRepay() public {
        _fund(alice, 50_000e6, 0);
        _fund(bob, 0, 5 ether);
        _supply(alice, 20_000e6);
        _collateral(bob, 5 ether);
        _borrow(bob, 1_000e6);
        assertEq(market.principalOutstanding(bob), 1_000e6);
        vm.warp(block.timestamp + 30 days);
        uint256 debt = market.positionDebt(bob);
        uint256 interest = debt - 1_000e6;
        assertGt(interest, 1);
        musdc.mint(bob, interest);
        vm.prank(bob);
        market.repay(bob, interest / 2);
        assertEq(market.principalOutstanding(bob), 1_000e6);
    }

    function test_LensMarketAndPositionViews() public {
        _fund(alice, 20_000e6, 1 ether);
        _supply(alice, 10_000e6);
        _collateral(alice, 1 ether);
        _borrow(alice, 100e6);
        MarketLens.MarketView memory mv = lens.marketView(address(market));
        assertEq(mv.loanDecimals, 6);
        assertEq(mv.collateralDecimals, 18);
        assertEq(mv.deliveryMode, uint8(ILendingMarket.DeliveryMode.Wallet));
        assertEq(mv.accountedCash, 9_900e6);
        assertEq(mv.oracleStatus, uint8(IMarketOracle.Status.OK));
        assertGt(mv.borrowAprRay, 0);
        MarketLens.PositionView memory pv = lens.positionView(address(market), alice);
        assertEq(pv.collateral, 1 ether);
        assertEq(pv.principal, 100e6);
        assertEq(pv.debt, market.positionDebt(alice));
        assertEq(pv.supplyAssets, ShareMath.supplierClaim(pv.supplyShares, mv.totalSupplyShares, mv.supplierAssets));
        assertFalse(pv.liquidatable);
        assertEq(pv.maxBorrow, market.maxBorrow(alice));
    }

    function test_FaucetDripCooldownAndOperator() public {
        TestnetFaucet faucet = new TestnetFaucet(musdc, mweth);
        musdc.setMinter(address(faucet), true);
        mweth.setMinter(address(faucet), true);
        vm.prank(alice);
        faucet.drip();
        assertEq(musdc.balanceOf(alice), 100_000e6);
        assertEq(mweth.balanceOf(alice), 50 ether);
        vm.prank(alice);
        vm.expectRevert(TestnetFaucet.Cooldown.selector);
        faucet.drip();
        faucet.dripTo(bob);
        assertEq(musdc.balanceOf(bob), 100_000e6);
        vm.prank(bob);
        vm.expectRevert(TestnetFaucet.NotOperator.selector);
        faucet.dripTo(carol);
        faucet.setAmounts(1e6, 1 ether);
        faucet.setCooldown(0);
        vm.prank(alice);
        faucet.drip();
        assertEq(musdc.balanceOf(alice), 100_001e6);
    }

    function test_WalletBorrowSendsToOwner() public {
        _fund(alice, 20_000e6, 0);
        _fund(bob, 0, 5 ether);
        _supply(alice, 10_000e6);
        _collateral(bob, 5 ether);
        uint256 before = musdc.balanceOf(bob);
        _borrow(bob, 500e6);
        assertEq(musdc.balanceOf(bob), before + 500e6);
        assertEq(uint8(market.deliveryMode()), uint8(ILendingMarket.DeliveryMode.Wallet));
    }

    function _walletInit(address recoveryEscrow) internal view returns (ILendingMarket.Init memory) {
        return ILendingMarket.Init({
            loanToken: address(musdc),
            collateralToken: address(mweth),
            oracle: address(oracle),
            maxLtvBps: 8000,
            liquidationThresholdBps: 9000,
            liquidationBonusBps: 500,
            supplyCap: SUPPLY_CAP,
            borrowCap: BORROW_CAP,
            deliveryMode: ILendingMarket.DeliveryMode.Wallet,
            defaultPositionCap: BORROW_CAP,
            recallWindow: 300,
            recoveryDelay: 300,
            minBorrow: MIN_BORROW,
            minSupply: MIN_SUPPLY,
            curator: curator,
            guardian: guardian,
            vaultFactory: address(0),
            recoveryEscrow: recoveryEscrow
        });
    }
}

contract WriteOffHook is IMarketRecoveryEscrow {
    address public lastOwner;
    uint256 public lastDebt;
    uint256 public lastSnapshot;

    function notifyWriteOff(address, address owner, uint256 snapshotId, uint256, uint256 debtWritten) external {
        lastOwner = owner;
        lastSnapshot = snapshotId;
        lastDebt = debtWritten;
    }

    function notifyRecovery(address, address, uint256) external pure returns (uint256) {
        return 0;
    }
}

contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("Fee USD", "fUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && value > 1) {
            uint256 fee = value / 100;
            super._update(from, to, value - fee);
            super._update(from, address(1), fee);
            return;
        }
        super._update(from, to, value);
    }
}
