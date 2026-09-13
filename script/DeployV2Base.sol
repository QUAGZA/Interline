// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TestAsset} from "../src/v2/mocks/TestAsset.sol";
import {MockPriceFeed} from "../src/v2/mocks/MockPriceFeed.sol";
import {MockSequencerFeed} from "../src/v2/mocks/MockSequencerFeed.sol";
import {TestnetFaucet} from "../src/v2/mocks/TestnetFaucet.sol";
import {MockERC4626Venue} from "../src/v2/mocks/MockERC4626Venue.sol";
import {MockSwapRouter} from "../src/v2/mocks/MockSwapRouter.sol";
import {ChainlinkPairOracle} from "../src/v2/oracles/ChainlinkPairOracle.sol";
import {MarketRecoveryEscrow} from "../src/v2/MarketRecoveryEscrow.sol";
import {MarketFactory} from "../src/v2/MarketFactory.sol";
import {MarketDeployer} from "../src/v2/MarketDeployer.sol";
import {BorrowerVaultFactory} from "../src/v2/BorrowerVaultFactory.sol";
import {VaultDeployer} from "../src/v2/VaultDeployer.sol";
import {MarketLens} from "../src/v2/MarketLens.sol";
import {LendingMarket} from "../src/v2/LendingMarket.sol";
import {ILendingMarket} from "../src/v2/interfaces/ILendingMarket.sol";
import {DirectFacilityFactory} from "../src/v2/direct/DirectFacilityFactory.sol";
import {DirectFacilityDeployer} from "../src/v2/direct/DirectFacilityDeployer.sol";
import {DirectFacilityLens} from "../src/v2/direct/DirectFacilityLens.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Shared V2 fixture deploy for Anvil (31337), Base Sepolia (84532), and Ethereum Sepolia (11155111).
/// @dev §6.2 params. `oracleMode` is always simulated (mock feeds). No participant keys.
struct DeployedV2 {
    TestAsset musdc;
    TestAsset mweth;
    MockPriceFeed usdcFeed;
    MockPriceFeed wethFeed;
    MockSequencerFeed sequencer;
    ChainlinkPairOracle oracle;
    MockERC4626Venue venue;
    MockSwapRouter router;
    TestnetFaucet faucet;
    MarketRecoveryEscrow escrow;
    MarketFactory factory;
    BorrowerVaultFactory vaultFactory;
    MarketLens lens;
    address walletMarket;
    address restrictedMarket;
    DirectFacilityFactory directFactory;
    DirectFacilityLens directLens;
    uint256 startBlock;
}

abstract contract DeployV2Base is Script {
    uint256 internal constant SUPPLY_CAP = 1_000_000e6;
    uint256 internal constant BORROW_CAP = 800_000e6;
    uint256 internal constant RESTRICTED_CAP = 25_000e6;
    uint256 internal constant MIN_BORROW = 10e6;
    uint256 internal constant MIN_SUPPLY = 1e6;
    uint16 internal constant MAX_LTV_BPS = 8000;
    uint16 internal constant LIQ_THRESHOLD_BPS = 9000;
    uint16 internal constant LIQ_BONUS_BPS = 500;
    uint256 internal constant FEED_STALE = 3_600;
    uint256 internal constant SEQUENCER_GRACE = 3_600;

    function deployV2(address curator, address guardian, uint32 recallWindow, uint32 recoveryDelay)
        internal
        returns (DeployedV2 memory d)
    {
        require(curator != address(0) && guardian != address(0), "roles");
        d.startBlock = block.number;

        d.musdc = new TestAsset("Mock USD Coin", "mUSDC", 6);
        d.mweth = new TestAsset("Mock Wrapped Ether", "mWETH", 18);
        d.usdcFeed = new MockPriceFeed(8, 1e8);
        d.wethFeed = new MockPriceFeed(8, 2000e8);
        d.sequencer = new MockSequencerFeed();
        // Sequencer grace is 3,600s; startedAt must be in the past so quotes are OK immediately.
        d.sequencer.setStartedAt(block.timestamp > SEQUENCER_GRACE + 1 ? block.timestamp - SEQUENCER_GRACE - 1 : 1);
        d.usdcFeed.setAnswer(1e8);
        d.wethFeed.setAnswer(2000e8);
        d.oracle = new ChainlinkPairOracle(
            address(d.wethFeed),
            address(d.usdcFeed),
            address(d.sequencer),
            18,
            6,
            FEED_STALE,
            FEED_STALE,
            SEQUENCER_GRACE
        );
        d.venue = new MockERC4626Venue(IERC20(address(d.musdc)));
        d.router = new MockSwapRouter(IERC20(address(d.musdc)), IERC20(address(d.mweth)), 2000e6);
        d.mweth.mint(address(d.router), 5_000 ether);
        d.musdc.mint(address(d.router), 10_000_000e6);
        d.faucet = new TestnetFaucet(d.musdc, d.mweth);
        d.musdc.setMinter(address(d.faucet), true);
        d.mweth.setMinter(address(d.faucet), true);
        d.escrow = new MarketRecoveryEscrow(curator);
        MarketDeployer marketDeployer = new MarketDeployer();
        d.factory = new MarketFactory(curator, address(d.escrow), address(marketDeployer));
        VaultDeployer vaultDeployer = new VaultDeployer();
        d.vaultFactory = new BorrowerVaultFactory(address(d.venue), address(d.router), address(d.mweth), address(vaultDeployer));
        d.lens = new MarketLens();
        d.escrow.setRegistrar(address(d.factory));

        // Separate literals: memory-to-memory struct assign is a reference, not a copy.
        ILendingMarket.Init memory wallet = ILendingMarket.Init({
            loanToken: address(d.musdc),
            collateralToken: address(d.mweth),
            oracle: address(d.oracle),
            maxLtvBps: MAX_LTV_BPS,
            liquidationThresholdBps: LIQ_THRESHOLD_BPS,
            liquidationBonusBps: LIQ_BONUS_BPS,
            supplyCap: SUPPLY_CAP,
            borrowCap: BORROW_CAP,
            deliveryMode: ILendingMarket.DeliveryMode.Wallet,
            defaultPositionCap: BORROW_CAP,
            recallWindow: recallWindow,
            recoveryDelay: recoveryDelay,
            minBorrow: MIN_BORROW,
            minSupply: MIN_SUPPLY,
            curator: curator,
            guardian: guardian,
            vaultFactory: address(0),
            recoveryEscrow: address(d.escrow)
        });
        ILendingMarket.Init memory restricted = ILendingMarket.Init({
            loanToken: address(d.musdc),
            collateralToken: address(d.mweth),
            oracle: address(d.oracle),
            maxLtvBps: MAX_LTV_BPS,
            liquidationThresholdBps: LIQ_THRESHOLD_BPS,
            liquidationBonusBps: LIQ_BONUS_BPS,
            supplyCap: SUPPLY_CAP,
            borrowCap: BORROW_CAP,
            deliveryMode: ILendingMarket.DeliveryMode.Restricted,
            defaultPositionCap: RESTRICTED_CAP,
            recallWindow: recallWindow,
            recoveryDelay: recoveryDelay,
            minBorrow: MIN_BORROW,
            minSupply: MIN_SUPPLY,
            curator: curator,
            guardian: guardian,
            vaultFactory: address(d.vaultFactory),
            recoveryEscrow: address(d.escrow)
        });

        d.walletMarket = d.factory.createMarket(wallet);
        d.restrictedMarket = d.factory.createMarket(restricted);
        d.directFactory = new DirectFacilityFactory(
            address(d.musdc),
            address(d.venue),
            address(d.router),
            address(d.mweth),
            address(d.oracle),
            address(d.vaultFactory),
            address(new DirectFacilityDeployer())
        );
        d.directLens = new DirectFacilityLens();
        require(d.factory.marketCount() == 2, "two markets");
        require(LendingMarket(d.walletMarket).deliveryMode() == ILendingMarket.DeliveryMode.Wallet, "wallet mode");
        require(
            LendingMarket(d.restrictedMarket).deliveryMode() == ILendingMarket.DeliveryMode.Restricted, "restricted mode"
        );
    }

    function writeManifest(DeployedV2 memory d, uint256 chainId, string memory path) internal {
        vm.createDir(string.concat("deployments/", vm.toString(chainId)), true);
        vm.writeFile(path, string.concat(_manifestHead(d, chainId), _manifestMarkets(d)));
    }

    function _manifestHead(DeployedV2 memory d, uint256 chainId) internal view returns (string memory s) {
        s = string.concat('{"chainId":', vm.toString(chainId));
        s = string.concat(s, ',"factory":"', vm.toString(address(d.factory)), '"');
        s = string.concat(s, ',"vaultFactory":"', vm.toString(address(d.vaultFactory)), '"');
        s = string.concat(s, ',"recoveryEscrow":"', vm.toString(address(d.escrow)), '"');
        s = string.concat(s, ',"lens":"', vm.toString(address(d.lens)), '"');
        s = string.concat(s, ',"startBlock":', vm.toString(d.startBlock));
        s = string.concat(s, ',"oracleMode":"simulated"');
        s = string.concat(s, ',"faucet":"', vm.toString(address(d.faucet)), '"');
        s = string.concat(s, ',"loanToken":"', vm.toString(address(d.musdc)), '"');
        s = string.concat(s, ',"collateralToken":"', vm.toString(address(d.mweth)), '"');
        s = string.concat(s, ',"swapRouter":"', vm.toString(address(d.router)), '"');
        s = string.concat(s, ',"venue":"', vm.toString(address(d.venue)), '"');
        s = string.concat(s, ',"directFactory":"', vm.toString(address(d.directFactory)), '"');
        s = string.concat(s, ',"directLens":"', vm.toString(address(d.directLens)), '"');
        s = string.concat(s, ',"curator":"', vm.toString(d.factory.curator()), '"');
        s = string.concat(s, ',"guardian":"', vm.toString(LendingMarket(d.walletMarket).guardian()), '"');
    }

    function _manifestMarkets(DeployedV2 memory d) internal view returns (string memory) {
        string memory walletObj = string.concat(
            '{"id":"usdc-weth-wallet","address":"',
            vm.toString(d.walletMarket),
            '","label":"mUSDC / mWETH - Wallet","deliveryMode":"wallet","loanSymbol":"mUSDC","collateralSymbol":"mWETH","oracle":"',
            vm.toString(address(d.oracle)),
            '"}'
        );
        string memory restrictedObj = string.concat(
            '{"id":"usdc-weth-restricted","address":"',
            vm.toString(d.restrictedMarket),
            '","label":"mUSDC / mWETH - Restricted","deliveryMode":"restricted","loanSymbol":"mUSDC","collateralSymbol":"mWETH","oracle":"',
            vm.toString(address(d.oracle)),
            '"}'
        );
        return string.concat(',"markets":[', walletObj, ",", restrictedObj, "]}");
    }

    function logDeploy(DeployedV2 memory d) internal view {
        console.log("factory", address(d.factory));
        console.log("walletMarket", d.walletMarket);
        console.log("restrictedMarket", d.restrictedMarket);
        console.log("directFactory", address(d.directFactory));
        console.log("directLens", address(d.directLens));
        console.log("faucet", address(d.faucet));
        console.log("musdc", address(d.musdc));
        console.log("mweth", address(d.mweth));
        console.log("lens", address(d.lens));
        console.log("startBlock", d.startBlock);
        console.log("oracleMode simulated");
    }
}
