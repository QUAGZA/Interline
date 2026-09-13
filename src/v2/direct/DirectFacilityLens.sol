// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DirectCreditFacility} from "./DirectCreditFacility.sol";
import {BorrowerVaultV2} from "../BorrowerVaultV2.sol";

/// @title DirectFacilityLens
/// @notice Read-only projections for overcollateralized direct agreements. No on-chain liquidation.
contract DirectFacilityLens {
    enum Acceptance {
        PENDING,
        ACCEPTED,
        DECLINED,
        CANCELLED,
        EXPIRED
    }

    enum Credit {
        UNFUNDED,
        AVAILABLE,
        FULLY_DRAWN,
        PAUSED,
        ENDED
    }

    enum DebtState {
        NO_DEBT,
        OUTSTANDING,
        OVERDUE
    }

    enum Recall {
        NONE,
        IN_WINDOW,
        RECOVERY_OPEN
    }

    struct Snapshot {
        address facility;
        address lender;
        address borrower;
        address vault;
        uint256 creditLimit;
        uint256 cash;
        uint256 debt;
        uint256 principal;
        uint256 accruedInterest;
        uint256 availableToBorrow;
        uint256 withdrawableCash;
        uint256 fixedAprRay;
        uint64 acceptanceDeadline;
        uint64 activatedAt;
        uint64 borrowExpiry;
        uint64 repaymentDueAt;
        uint64 recallDeadline;
        uint64 effectiveDue;
        bool ended;
        Acceptance acceptance;
        Credit credit;
        DebtState debtState;
        Recall recall;
        uint256 vaultIdle;
        uint256 venueShares;
        uint256 collateralPosted;
        uint16 maxLtvBps;
    }

    function snapshot(address facility) external view returns (Snapshot memory s) {
        DirectCreditFacility f = DirectCreditFacility(facility);
        s.facility = facility;
        s.lender = f.lender();
        s.borrower = f.borrower();
        s.vault = f.vault();
        s.creditLimit = f.creditLimit();
        s.cash = f.accountedCash();
        s.debt = f.currentDebt();
        s.principal = f.principalOutstanding();
        s.accruedInterest = s.debt > s.principal ? s.debt - s.principal : 0;
        s.availableToBorrow = f.availableToBorrow();
        s.withdrawableCash = s.cash;
        s.fixedAprRay = f.aprRay();
        s.acceptanceDeadline = f.acceptanceDeadline();
        s.activatedAt = f.activatedAt();
        s.borrowExpiry = f.borrowExpiry();
        s.repaymentDueAt = f.repaymentDueAt();
        s.recallDeadline = f.recallDeadline();
        s.ended = f.ended();
        s.acceptance = _acceptance(f);
        s.credit = _credit(f, s.cash, s.debt);
        s.debtState = _debt(f, s.debt);
        s.recall = _recall(f);
        s.effectiveDue = f.publicRecoveryDeadline();
        if (s.vault != address(0)) {
            BorrowerVaultV2 v = BorrowerVaultV2(s.vault);
            s.vaultIdle = v.idleLoan();
            s.venueShares = v.venueShares();
        }
        s.collateralPosted = f.collateralPosted();
        s.maxLtvBps = f.MAX_LTV_BPS();
    }

    function _acceptance(DirectCreditFacility f) internal view returns (Acceptance) {
        if (f.ended()) return Acceptance.ACCEPTED;
        if (f.declined()) return Acceptance.DECLINED;
        if (f.cancelled()) return Acceptance.CANCELLED;
        if (f.lenderAccepted() && f.borrowerAccepted()) return Acceptance.ACCEPTED;
        if (block.timestamp > f.acceptanceDeadline()) return Acceptance.EXPIRED;
        return Acceptance.PENDING;
    }

    function _credit(DirectCreditFacility f, uint256 cash, uint256 debt) internal view returns (Credit) {
        if (f.ended()) return Credit.ENDED;
        if (!(f.lenderAccepted() && f.borrowerAccepted())) return Credit.UNFUNDED;
        if (f.borrowingPaused()) return Credit.PAUSED;
        if (cash == 0 && debt == 0) return Credit.UNFUNDED;
        if (f.availableToBorrow() == 0 && cash == 0) return Credit.FULLY_DRAWN;
        return Credit.AVAILABLE;
    }

    function _debt(DirectCreditFacility f, uint256 debt) internal view returns (DebtState) {
        if (debt == 0) return DebtState.NO_DEBT;
        uint64 due = f.publicRecoveryDeadline();
        if (due != 0 && block.timestamp >= due) return DebtState.OVERDUE;
        return DebtState.OUTSTANDING;
    }

    function _recall(DirectCreditFacility f) internal view returns (Recall) {
        if (!f.recallActive()) return Recall.NONE;
        uint64 deadline = f.publicRecoveryDeadline();
        if (deadline != 0 && block.timestamp > deadline) return Recall.RECOVERY_OPEN;
        return Recall.IN_WINDOW;
    }

    function previewSettlement(address facility)
        external
        view
        returns (uint256 collateralToLender, uint256 residualToBorrower, uint256 debtCredit)
    {
        return DirectCreditFacility(facility).previewSettlement();
    }
}
