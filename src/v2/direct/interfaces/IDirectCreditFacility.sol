// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDirectCreditFacility {
    struct Terms {
        address lender;
        address borrower;
        address loanToken;
        uint256 creditLimit;
        uint256 aprRay;
        uint32 acceptanceLifetime;
        uint32 borrowPeriod;
        uint32 recallWindow;
        address venue;
        address swapRouter;
        address otherToken;
    }

    function lender() external view returns (address);
    function borrower() external view returns (address);
    function vault() external view returns (address);
    function termsHash() external view returns (bytes32);
    function accountedCash() external view returns (uint256);
    function creditLimit() external view returns (uint256);
    function collateralPosted() external view returns (uint256);
    function ended() external view returns (bool);
    function publicRecoveryDeadline() external view returns (uint64);
    function settleDefault() external;
    function previewSettlement()
        external
        view
        returns (uint256 collateralToLender, uint256 residualToBorrower, uint256 debtCredit);
}
