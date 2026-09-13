// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMarketRecoveryEscrow {
    function notifyWriteOff(
        address market,
        address owner,
        uint256 snapshotId,
        uint256 totalShares,
        uint256 debtWritten
    ) external;

    function notifyRecovery(address market, address owner, uint256 assets) external returns (uint256 taken);
}
