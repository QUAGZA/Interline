// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console} from "forge-std/Script.sol";
import {DeployV2Base, DeployedV2} from "./DeployV2Base.sol";

/// @notice Public testnet deploy: Base Sepolia (84532) or Ethereum Sepolia (11155111).
/// @dev Recall 1h, recovery delay 24h. No faucet seed / no participant keys.
///      forge script script/DeployV2Testnet.s.sol:DeployV2Testnet --rpc-url $RPC_URL --broadcast --via-ir --optimizer-runs 1
contract DeployV2Testnet is DeployV2Base {
    uint32 internal constant TESTNET_RECALL_WINDOW = 3_600;
    uint32 internal constant TESTNET_RECOVERY_DELAY = 86_400;

    function run() external {
        require(block.chainid == 84532 || block.chainid == 11155111, "DeployV2Testnet: 84532 or 11155111");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address curator = vm.addr(pk);
        address guardian = vm.envOr("GUARDIAN_ADDRESS", curator);

        vm.startBroadcast(pk);
        DeployedV2 memory d = deployV2(curator, guardian, TESTNET_RECALL_WINDOW, TESTNET_RECOVERY_DELAY);
        vm.stopBroadcast();

        string memory path = string.concat("deployments/", vm.toString(block.chainid), "/v2.json");
        writeManifest(d, block.chainid, path);
        logDeploy(d);
        console.log("wrote", path);
    }
}
