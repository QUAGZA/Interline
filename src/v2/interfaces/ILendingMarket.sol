// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILendingMarket {
    enum DeliveryMode {
        Wallet,
        Restricted
    }

    struct Init {
        address loanToken;
        address collateralToken;
        address oracle;
        uint16 maxLtvBps;
        uint16 liquidationThresholdBps;
        uint16 liquidationBonusBps;
        uint256 supplyCap;
        uint256 borrowCap;
        DeliveryMode deliveryMode;
        uint256 defaultPositionCap;
        uint32 recallWindow;
        uint32 recoveryDelay;
        uint256 minBorrow;
        uint256 minSupply;
        address curator;
        address guardian;
        address vaultFactory;
        address recoveryEscrow;
    }
}
