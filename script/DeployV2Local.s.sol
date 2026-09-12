// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console} from "forge-std/Script.sol";
import {DeployV2Base, DeployedV2} from "./DeployV2Base.sol";
import {SeedV2Anvil} from "./SeedV2Anvil.s.sol";

/// @notice Anvil (31337) deploy: two USDC/WETH markets (wallet + restricted) + faucet seed.
/// @dev forge script script/DeployV2Local.s.sol:DeployV2Local --rpc-url http://127.0.0.1:8545 --broadcast --via-ir
contract DeployV2Local is DeployV2Base, SeedV2Anvil {
    uint32 internal constant ANVIL_RECALL_WINDOW = 300;
    uint32 internal constant ANVIL_RECOVERY_DELAY = 300;

    function run() external {
        require(block.chainid == 31337, "DeployV2Local: chain 31337 only");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address curator = vm.addr(pk);

        vm.startBroadcast(pk);
        DeployedV2 memory d = deployV2(curator, curator, ANVIL_RECALL_WINDOW, ANVIL_RECOVERY_DELAY);
        vm.stopBroadcast();

        seedAnvil(d.faucet, d.walletMarket, d.restrictedMarket);

        writeManifest(d, 31337, "deployments/31337/v2.json");
        logDeploy(d);
        console.log("wrote deployments/31337/v2.json");
    }
}
