// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MarketFixture} from "./MarketFixture.sol";
import {LendingMarket} from "../../../src/v2/LendingMarket.sol";
import {ILendingMarket} from "../../../src/v2/interfaces/ILendingMarket.sol";
import {BorrowerVaultFactory} from "../../../src/v2/BorrowerVaultFactory.sol";
import {BorrowerVaultV2} from "../../../src/v2/BorrowerVaultV2.sol";
import {MockERC4626Venue} from "../../../src/v2/mocks/MockERC4626Venue.sol";
import {MockSwapRouter} from "../../../src/v2/mocks/MockSwapRouter.sol";
import {MarketRecoveryEscrow} from "../../../src/v2/MarketRecoveryEscrow.sol";
import {MarketFactory} from "../../../src/v2/MarketFactory.sol";
import {TestAsset} from "../../../src/v2/mocks/TestAsset.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract RestrictedFixture is MarketFixture {
    uint256 internal constant RESTRICTED_CAP = 25_000e6;

    MockERC4626Venue internal venue;
    MockSwapRouter internal router;
    BorrowerVaultFactory internal vaultFactory;
    MarketRecoveryEscrow internal escrow;
    MarketFactory internal factory;
    LendingMarket internal restricted;
    TestAsset internal junk;

    function _deployRestricted() internal {
        _deployWalletMarket();
        junk = new TestAsset("Junk", "JUNK", 18);
        venue = new MockERC4626Venue(IERC20(address(musdc)));
        router = new MockSwapRouter(IERC20(address(musdc)), IERC20(address(mweth)), 2000e6);
        mweth.mint(address(router), 10_000 ether);
        musdc.mint(address(router), 20_000_000e6);
        vaultFactory = new BorrowerVaultFactory(address(venue), address(router), address(mweth));
        escrow = new MarketRecoveryEscrow(address(this));
        factory = new MarketFactory(curator, address(escrow));
        escrow.setRegistrar(address(factory));
        vm.prank(curator);
        restricted = LendingMarket(factory.createMarket(_restrictedInit()));
    }

    function _restrictedInit() internal view returns (ILendingMarket.Init memory) {
        return ILendingMarket.Init({
            loanToken: address(musdc),
            collateralToken: address(mweth),
            oracle: address(oracle),
            maxLtvBps: 7000,
            liquidationThresholdBps: 8000,
            liquidationBonusBps: 500,
            supplyCap: SUPPLY_CAP,
            borrowCap: BORROW_CAP,
            deliveryMode: ILendingMarket.DeliveryMode.Restricted,
            defaultPositionCap: RESTRICTED_CAP,
            recallWindow: 300,
            recoveryDelay: 300,
            minBorrow: MIN_BORROW,
            minSupply: MIN_SUPPLY,
            curator: curator,
            guardian: guardian,
            vaultFactory: address(vaultFactory),
            recoveryEscrow: address(escrow)
        });
    }

    function _walletInit() internal view returns (ILendingMarket.Init memory init) {
        init = _restrictedInit();
        init.deliveryMode = ILendingMarket.DeliveryMode.Wallet;
        init.defaultPositionCap = BORROW_CAP;
        init.vaultFactory = address(0);
    }

    function _fundRestricted(address user, uint256 usdcAmt, uint256 wethAmt) internal {
        if (usdcAmt > 0) musdc.mint(user, usdcAmt);
        if (wethAmt > 0) mweth.mint(user, wethAmt);
        vm.startPrank(user);
        musdc.approve(address(restricted), type(uint256).max);
        mweth.approve(address(restricted), type(uint256).max);
        vm.stopPrank();
    }

    function _openRestrictedBorrow(address supplier, address borrower_, uint256 supplyAmt, uint256 collat, uint256 borrowAmt)
        internal
        returns (BorrowerVaultV2 vault)
    {
        _fundRestricted(supplier, supplyAmt, 0);
        _fundRestricted(borrower_, 0, collat);
        vm.prank(supplier);
        restricted.supply(supplyAmt, 0);
        vm.startPrank(borrower_);
        restricted.addCollateral(borrower_, collat);
        restricted.borrow(borrowAmt, type(uint256).max);
        vm.stopPrank();
        vault = BorrowerVaultV2(vaultFactory.vaultOf(address(restricted), borrower_));
    }

    function _writeOffBob(BorrowerVaultV2) internal {
        _fundRestricted(carol, 5_000e6, 0);
        wethFeed.setAnswer(1_000e8);
        uint256 col = restricted.collateralOf(bob);
        vm.prank(carol);
        restricted.liquidate(bob, 0, col, type(uint256).max, 0);
        assertTrue(restricted.defaulted(bob));
    }
}
