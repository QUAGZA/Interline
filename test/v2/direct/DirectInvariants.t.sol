// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DirectFixture} from "../fixtures/DirectFixture.sol";
import {DirectCreditFacility} from "../../../src/v2/direct/DirectCreditFacility.sol";

contract DirectInvariantsTest is DirectFixture {
    DirectCreditFacility internal fac;

    function setUp() public {
        _deployDirectStack();
        fac = _createAccepted(alice, bob);
        bytes4[] memory sels = new bytes4[](4);
        sels[0] = this.invFund.selector;
        sels[1] = this.invBorrow.selector;
        sels[2] = this.invRepay.selector;
        sels[3] = this.invWithdraw.selector;
        targetSelector(FuzzSelector({addr: address(this), selectors: sels}));
        targetContract(address(this));
    }

    function invFund(uint256 amt) public {
        amt = bound(amt, 1e6, 5_000e6);
        musdc.mint(alice, amt);
        vm.startPrank(alice);
        musdc.approve(address(fac), amt);
        try fac.fund(amt) {} catch {}
        vm.stopPrank();
    }

    function invBorrow(uint256 amt) public {
        amt = bound(amt, 1, 5_000e6);
        vm.prank(bob);
        try fac.borrow(amt, type(uint256).max, block.timestamp + 1) {} catch {}
    }

    function invRepay(uint256 amt) public {
        amt = bound(amt, 1, 10_000e6);
        musdc.mint(bob, amt);
        vm.startPrank(bob);
        musdc.approve(address(fac), amt);
        try fac.repayAssets(amt) {} catch {}
        vm.stopPrank();
    }

    function invWithdraw(uint256 amt) public {
        uint256 c = fac.accountedCash();
        if (c == 0) return;
        amt = bound(amt, 1, c);
        vm.prank(alice);
        try fac.withdrawCash(amt) {} catch {}
    }

    function invariant_CashLeqBalance() public view {
        assertLe(fac.accountedCash(), musdc.balanceOf(address(fac)));
    }

    function invariant_PoolUntouched() public view {
        assertEq(restricted.accountedCash(), 0);
        assertEq(restricted.totalDebtShares(), 0);
    }

    function invariant_NoWriteOff() public view {
        assertEq(fac.recoveryObligation(bob), 0);
        assertFalse(fac.isDefaulted(bob));
    }
}
