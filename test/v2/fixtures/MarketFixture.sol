// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {LendingMarket} from "../../../src/v2/LendingMarket.sol";
import {ILendingMarket} from "../../../src/v2/interfaces/ILendingMarket.sol";
import {MarketLens} from "../../../src/v2/MarketLens.sol";
import {TestAsset} from "../../../src/v2/mocks/TestAsset.sol";
import {MockPriceFeed} from "../../../src/v2/mocks/MockPriceFeed.sol";
import {MockSequencerFeed} from "../../../src/v2/mocks/MockSequencerFeed.sol";
import {ChainlinkPairOracle} from "../../../src/v2/oracles/ChainlinkPairOracle.sol";
import {InterestMath} from "../../../src/v2/libraries/InterestMath.sol";
import {ShareMath} from "../../../src/v2/libraries/ShareMath.sol";
import {PriceMath} from "../../../src/v2/libraries/PriceMath.sol";

contract MarketFixture is Test {
    TestAsset internal musdc;
    TestAsset internal mweth;
    MockPriceFeed internal usdcFeed;
    MockPriceFeed internal wethFeed;
    MockSequencerFeed internal sequencer;
    ChainlinkPairOracle internal oracle;
    LendingMarket internal market;
    MarketLens internal lens;

    address internal curator;
    address internal guardian;
    address internal alice;
    address internal bob;
    address internal carol;
    address internal dave;
    address internal eve;
    address internal frank;

    uint256 internal constant SUPPLY_CAP = 1_000_000e6;
    uint256 internal constant BORROW_CAP = 800_000e6;
    uint256 internal constant MIN_BORROW = 10e6;
    uint256 internal constant MIN_SUPPLY = 1e6;

    function _deployWalletMarket() internal {
        curator = makeAddr("curator");
        guardian = makeAddr("guardian");
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        carol = makeAddr("carol");
        dave = makeAddr("dave");
        eve = makeAddr("eve");
        frank = makeAddr("frank");

        musdc = new TestAsset("Mock USD Coin", "mUSDC", 6);
        mweth = new TestAsset("Mock Wrapped Ether", "mWETH", 18);
        usdcFeed = new MockPriceFeed(8, 1e8);
        wethFeed = new MockPriceFeed(8, 2000e8);
        sequencer = new MockSequencerFeed();
        vm.warp(block.timestamp + 10_000);
        usdcFeed.setAnswer(1e8);
        wethFeed.setAnswer(2000e8);
        sequencer.setStartedAt(1);

        oracle = new ChainlinkPairOracle(
            address(wethFeed), address(usdcFeed), address(sequencer), 18, 6, 3_600, 3_600, 3_600
        );

        market = new LendingMarket(
            ILendingMarket.Init({
                loanToken: address(musdc),
                collateralToken: address(mweth),
                oracle: address(oracle),
                maxLtvBps: 7000,
                liquidationThresholdBps: 8000,
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
        lens = new MarketLens();
    }

    function _fund(address user, uint256 usdcAmt, uint256 wethAmt) internal {
        if (usdcAmt > 0) musdc.mint(user, usdcAmt);
        if (wethAmt > 0) mweth.mint(user, wethAmt);
        vm.startPrank(user);
        musdc.approve(address(market), type(uint256).max);
        mweth.approve(address(market), type(uint256).max);
        vm.stopPrank();
    }

    function _supply(address user, uint256 amount) internal {
        vm.prank(user);
        market.supply(amount, 0);
    }

    function _collateral(address user, uint256 amount) internal {
        vm.prank(user);
        market.addCollateral(user, amount);
    }

    function _borrow(address user, uint256 amount) internal {
        vm.prank(user);
        market.borrow(amount, type(uint256).max);
    }
}
