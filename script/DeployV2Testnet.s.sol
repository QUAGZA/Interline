// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console} from "forge-std/Script.sol";
import {DeployV2Base, DeployedV2} from "./DeployV2Base.sol";

/// @notice Base Sepolia (84532) deploy. Recall 1h, recovery delay 24h. No faucet seed / no participant keys.
/// @dev forge script script/DeployV2Testnet.s.sol:DeployV2Testnet --rpc-url $RPC_URL --broadcast --chain 84532 --via-ir
contract DeployV2Testnet is DeployV2Base {
    uint32 internal constant TESTNET_RECALL_WINDOW = 3_600;
    uint32 internal constant TESTNET_RECOVERY_DELAY = 86_400;

    function run() external {
        require(block.chainid == 84532, "DeployV2Testnet: chain 84532 only");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address curator = vm.addr(pk);
        address guardian = vm.envOr("GUARDIAN_ADDRESS", curator);

        vm.startBroadcast(pk);
        DeployedV2 memory d = deployV2(curator, guardian, TESTNET_RECALL_WINDOW, TESTNET_RECOVERY_DELAY);
        vm.stopBroadcast();

        writeManifest(d, 84532, "deployments/84532/v2.json");
        logDeploy(d);
        console.log("wrote deployments/84532/v2.json");
    }
}
