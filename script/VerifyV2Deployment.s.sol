// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {LendingMarket} from "../src/v2/LendingMarket.sol";
import {MarketFactory} from "../src/v2/MarketFactory.sol";
import {ILendingMarket} from "../src/v2/interfaces/ILendingMarket.sol";
import {DirectFacilityFactory} from "../src/v2/direct/DirectFacilityFactory.sol";

/// @notice Checks deployments/{chainId}/v2.json against live contracts (Anvil, Base Sepolia, Ethereum Sepolia).
/// @dev forge script script/VerifyV2Deployment.s.sol:VerifyV2Deployment --rpc-url $RPC_URL --via-ir
contract VerifyV2Deployment is Script {
    using stdJson for string;

    uint256 internal constant SUPPLY_CAP = 1_000_000e6;
    uint256 internal constant BORROW_CAP = 800_000e6;
    uint256 internal constant RESTRICTED_CAP = 25_000e6;

    function run() external view {
        uint256 chainId = block.chainid;
        require(chainId == 31337 || chainId == 84532 || chainId == 11155111, "unsupported chain");

        string memory path = string.concat("deployments/", vm.toString(chainId), "/v2.json");
        string memory json = vm.readFile(path);

        require(json.readUint(".chainId") == chainId, "chain mismatch");
        require(
            keccak256(bytes(json.readString(".oracleMode"))) == keccak256(bytes("simulated")), "oracleMode simulated"
        );
        require(!vm.keyExistsJson(json, ".lender"), "no lender key");
        require(!vm.keyExistsJson(json, ".borrower"), "no borrower key");
        require(!vm.keyExistsJson(json, ".lenderAddress"), "no lenderAddress");
        require(!vm.keyExistsJson(json, ".borrowerAddress"), "no borrowerAddress");

        address factory = json.readAddress(".factory");
        address faucet = json.readAddress(".faucet");
        require(factory.code.length > 0, "factory code");
        require(faucet.code.length > 0, "faucet code");
        require(MarketFactory(factory).marketCount() == 2, "need two markets");

        address wallet = json.readAddress(".markets[0].address");
        address restricted = json.readAddress(".markets[1].address");
        require(wallet == MarketFactory(factory).marketAt(0), "wallet index");
        require(restricted == MarketFactory(factory).marketAt(1), "restricted index");
        require(LendingMarket(wallet).deliveryMode() == ILendingMarket.DeliveryMode.Wallet, "wallet mode");
        require(LendingMarket(restricted).deliveryMode() == ILendingMarket.DeliveryMode.Restricted, "restricted mode");

        require(LendingMarket(wallet).maxLtvBps() == 8000, "ltv");
        require(LendingMarket(wallet).liquidationThresholdBps() == 9000, "lt");
        require(LendingMarket(wallet).liquidationBonusBps() == 500, "bonus");
        require(LendingMarket(wallet).supplyCap() == SUPPLY_CAP, "supply cap");
        require(LendingMarket(wallet).borrowCap() == BORROW_CAP, "borrow cap");
        require(LendingMarket(wallet).defaultPositionCap() == BORROW_CAP, "wallet pos cap");
        require(LendingMarket(restricted).defaultPositionCap() == RESTRICTED_CAP, "restricted pos cap");
        require(LendingMarket(wallet).minBorrow() == 10e6, "min borrow");
        require(LendingMarket(wallet).minSupply() == 1e6, "min supply");

        uint32 recall = chainId == 31337 ? uint32(300) : uint32(3_600);
        uint32 recovery = chainId == 31337 ? uint32(300) : uint32(86_400);
        require(LendingMarket(wallet).recallWindow() == recall, "recall window");
        require(LendingMarket(wallet).recoveryDelay() == recovery, "recovery delay");
        require(LendingMarket(restricted).recallWindow() == recall, "restricted recall");
        require(LendingMarket(restricted).recoveryDelay() == recovery, "restricted recovery");

        require(address(LendingMarket(wallet).loanToken()) == json.readAddress(".loanToken"), "loan token");
        require(address(LendingMarket(wallet).collateralToken()) == json.readAddress(".collateralToken"), "collat token");

        if (vm.keyExistsJson(json, ".directFactory")) {
            address directFactory = json.readAddress(".directFactory");
            if (directFactory != address(0)) {
                require(directFactory.code.length > 0, "direct factory code");
                require(DirectFacilityFactory(directFactory).loanToken() == json.readAddress(".loanToken"), "direct loan");
                require(DirectFacilityFactory(directFactory).oracle() == address(LendingMarket(wallet).oracle()), "direct oracle");
                require(DirectFacilityFactory(directFactory).vaultFactory() == json.readAddress(".vaultFactory"), "direct vault factory");
            }
        }
        if (vm.keyExistsJson(json, ".directLens")) {
            address directLens = json.readAddress(".directLens");
            if (directLens != address(0)) require(directLens.code.length > 0, "direct lens code");
        }

        console.log("verified factory", factory);
        console.log("wallet", wallet);
        console.log("restricted", restricted);
        console.log("faucet", faucet);
        console.log("oracleMode simulated");
    }
}
