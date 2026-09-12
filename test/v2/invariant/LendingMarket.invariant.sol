// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MarketFixture} from "../fixtures/MarketFixture.sol";
import {LendingMarket} from "../../../src/v2/LendingMarket.sol";
import {TestAsset} from "../../../src/v2/mocks/TestAsset.sol";
import {ShareMath} from "../../../src/v2/libraries/ShareMath.sol";
import {PriceMath} from "../../../src/v2/libraries/PriceMath.sol";

/// @dev Random user of a wallet-mode market. Skips rather than reverting on illegal ops.
contract MarketHandler is Test {
    LendingMarket public market;
    TestAsset public musdc;
    TestAsset public mweth;
    address[] public actors;

    constructor(LendingMarket market_, TestAsset musdc_, TestAsset mweth_, address[] memory actors_) {
        market = market_;
        musdc = musdc_;
        mweth = mweth_;
        actors = actors_;
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function supply(uint256 seed, uint256 raw) external {
        address a = _actor(seed);
        uint256 amount = bound(raw, 1e6, 20_000e6);
        if (market.supplyFrozen() || market.recallActive() || market.marketTerminal()) return;
        musdc.mint(a, amount);
        vm.startPrank(a);
        musdc.approve(address(market), type(uint256).max);
        try market.supply(amount, 0) {} catch {}
        vm.stopPrank();
    }

    function withdraw(uint256 seed, uint256 raw) external {
        address a = _actor(seed);
        uint256 maxW = market.maxWithdraw(a);
        if (maxW == 0) return;
        uint256 amount = bound(raw, 1, maxW);
        vm.prank(a);
        try market.withdraw(amount, type(uint256).max) {} catch {}
    }

    function addCollateral(uint256 seed, uint256 raw) external {
        address a = _actor(seed);
        uint256 amount = bound(raw, 1e15, 5 ether);
        mweth.mint(a, amount);
        vm.startPrank(a);
        mweth.approve(address(market), type(uint256).max);
        try market.addCollateral(a, amount) {} catch {}
        vm.stopPrank();
    }

    function removeCollateral(uint256 seed, uint256 raw) external {
        address a = _actor(seed);
        uint256 held = market.collateralOf(a);
        if (held == 0) return;
        uint256 amount = bound(raw, 1, held);
        vm.prank(a);
        try market.removeCollateral(amount) {} catch {}
    }

    function borrow(uint256 seed, uint256 raw) external {
        address a = _actor(seed);
        uint256 maxB = market.maxBorrow(a);
        if (maxB < 10e6) return;
        uint256 amount = bound(raw, 10e6, maxB);
        vm.prank(a);
        try market.borrow(amount, type(uint256).max) {} catch {}
    }

    function repay(uint256 seed, uint256 raw) external {
        address a = _actor(seed);
        uint256 debt = market.positionDebt(a);
        if (debt == 0) return;
        uint256 amount = bound(raw, 1, debt);
        musdc.mint(a, amount);
        vm.startPrank(a);
        musdc.approve(address(market), type(uint256).max);
        try market.repay(a, amount) {} catch {}
        vm.stopPrank();
    }

    function repayAll(uint256 seed) external {
        address a = _actor(seed);
        uint256 debt = market.positionDebt(a);
        if (debt == 0) return;
        musdc.mint(a, debt);
        vm.startPrank(a);
        musdc.approve(address(market), type(uint256).max);
        try market.repayAll(a, debt) {} catch {}
        vm.stopPrank();
    }

    function liquidate(uint256 liquidatorSeed, uint256 victimSeed) external {
        address liquidator = _actor(liquidatorSeed);
        address victim = _actor(victimSeed);
        (,,,,, bool liquidatable) = market.healthOf(victim);
        if (!liquidatable) return;
        uint256 shares = market.debtSharesOf(victim);
        if (shares == 0) return;
        musdc.mint(liquidator, 1_000_000e6);
        vm.startPrank(liquidator);
        musdc.approve(address(market), type(uint256).max);
        try market.liquidate(victim, shares, 0, type(uint256).max, 0) {} catch {}
        vm.stopPrank();
    }

    function warpTime(uint256 raw) external {
        vm.warp(block.timestamp + bound(raw, 1, 7 days));
    }
}

/// forge-config: default.invariant.runs = 64
/// forge-config: default.invariant.depth = 16
/// forge-config: default.invariant.fail-on-revert = false
contract LendingMarketInvariantTest is MarketFixture {
    MarketHandler internal handler;

    function setUp() public {
        _deployWalletMarket();
        address[] memory actors = new address[](3);
        actors[0] = alice;
        actors[1] = bob;
        actors[2] = carol;
        _fund(alice, 100_000e6, 20 ether);
        _fund(bob, 100_000e6, 20 ether);
        _fund(carol, 100_000e6, 20 ether);
        _supply(alice, 50_000e6);
        handler = new MarketHandler(market, musdc, mweth, actors);
        targetContract(address(handler));
    }

    function invariant_AccountedCashCoveredByBalance() public view {
        uint256 bal = musdc.balanceOf(address(market));
        assertGe(bal, market.accountedCash());
        assertEq(bal - market.accountedCash(), market.unaccountedSurplus());
    }

    function invariant_SupplierAssetsIdentity() public view {
        assertEq(market.supplierAssets(), market.accountedCash() + market.aggregateDebt());
    }

    function invariant_ActorSharesDoNotExceedTotals() public view {
        uint256 s = market.supplySharesOf(alice) + market.supplySharesOf(bob) + market.supplySharesOf(carol);
        uint256 q = market.debtSharesOf(alice) + market.debtSharesOf(bob) + market.debtSharesOf(carol);
        assertLe(s, market.totalSupplyShares());
        assertLe(q, market.totalDebtShares());
        assertEq(s, market.totalSupplyShares());
        assertEq(q, market.totalDebtShares());
    }

    function invariant_CollateralEscrowMatchesSum() public view {
        uint256 sum = market.collateralOf(alice) + market.collateralOf(bob) + market.collateralOf(carol);
        assertEq(mweth.balanceOf(address(market)), sum);
    }

    function invariant_MaxWithdrawRespectsCash() public view {
        assertLe(market.maxWithdraw(alice), market.accountedCash());
        assertLe(market.maxWithdraw(bob), market.accountedCash());
        assertLe(market.maxWithdraw(carol), market.accountedCash());
    }

    function invariant_HfEqualityNotLiquidatable() public view {
        _assertHf(alice);
        _assertHf(bob);
        _assertHf(carol);
    }

    function invariant_LoanAndCollateralAreDistinct() public view {
        assertTrue(address(market.loanToken()) != address(market.collateralToken()));
        assertEq(address(market.loanToken()), address(musdc));
        assertEq(address(market.collateralToken()), address(mweth));
    }

    function _assertHf(address owner) internal view {
        (PriceMath.HealthCode code,, uint256 debt, uint256 liq,, bool liquidatable) = market.healthOf(owner);
        if (debt == 0) {
            assertEq(uint256(code), uint256(PriceMath.HealthCode.NO_DEBT));
            assertFalse(liquidatable);
            return;
        }
        if (uint256(code) == uint256(PriceMath.HealthCode.UNAVAILABLE)) {
            assertFalse(liquidatable);
            return;
        }
        assertEq(liquidatable, debt > liq);
        if (debt == liq) assertFalse(liquidatable);
    }

    function invariant_ShareMathClaimBoundedByAssets() public view {
        uint256 S = market.totalSupplyShares();
        uint256 A = market.supplierAssets();
        if (S == 0) return;
        uint256 claim = ShareMath.supplierClaim(market.supplySharesOf(alice), S, A)
            + ShareMath.supplierClaim(market.supplySharesOf(bob), S, A)
            + ShareMath.supplierClaim(market.supplySharesOf(carol), S, A);
        assertLe(claim, A);
    }
}
