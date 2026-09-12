// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {BorrowerVault} from "../src/BorrowerVault.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {JunkToken} from "../src/mocks/JunkToken.sol";
import {MockSwap} from "../src/mocks/MockSwap.sol";
import {MockTarget} from "../src/mocks/MockTarget.sol";

contract CreditLineTest is Test {
    uint256 internal constant CAP = 2_000_000e6;
    uint32 internal constant RECALL_WINDOW = 300;

    CreditLine internal line;
    BorrowerVault internal vault;
    MockERC20 internal usdc;
    MockERC20 internal weth;
    JunkToken internal junk;
    MockSwap internal swap;
    MockTarget internal target;

    address internal lender;
    address internal borrower;
    address internal stranger;

    function setUp() public {
        lender = makeAddr("lender");
        borrower = makeAddr("borrower");
        stranger = makeAddr("stranger");

        usdc = new MockERC20("USD Coin", "USDC", 6);
        weth = new MockERC20("Wrapped Ether", "WETH", 18);
        junk = new JunkToken();
        swap = new MockSwap();
        target = new MockTarget(address(usdc));
        vault = new BorrowerVault(address(swap));

        address[] memory tokens = new address[](1);
        tokens[0] = address(weth);
        address[] memory targets = new address[](1);
        targets[0] = address(target);

        line = new CreditLine(
            lender,
            borrower,
            address(usdc),
            CAP,
            500,
            uint64(block.timestamp + 365 days),
            RECALL_WINDOW,
            tokens,
            targets,
            address(vault)
        );
        vault.setLine(address(line), tokens, targets);

        usdc.mint(lender, 10_000_000e6);
        weth.mint(address(swap), 10_000_000 ether);
        junk.mint(address(swap), 10_000_000 ether);

        vm.startPrank(lender);
        usdc.approve(address(line), type(uint256).max);
        line.deposit(5_000_000e6);
        vm.stopPrank();
    }

    function _hash(uint256 newCap, uint256 nonce, bytes32 salt) internal pure returns (bytes32) {
        return keccak256(abi.encode(newCap, nonce, salt));
    }

    function _draw(uint256 amount) internal {
        vm.prank(borrower);
        line.draw(amount);
    }

    function test_DrawUpToCap() public {
        _draw(CAP);
        assertEq(line.drawn(), CAP);
        assertEq(usdc.balanceOf(address(vault)), CAP);
        assertEq(usdc.balanceOf(address(line)), 5_000_000e6 - CAP);
    }

    function test_DrawOverCapReverts() public {
        vm.prank(borrower);
        vm.expectRevert(CreditLine.CapExceeded.selector);
        line.draw(CAP + 1);
    }

    function test_DrawWhenPausedReverts() public {
        vm.prank(lender);
        line.pauseDraws();
        vm.prank(borrower);
        vm.expectRevert(CreditLine.Paused.selector);
        line.draw(1e6);
    }

    function test_DrawDuringRecallReverts() public {
        vm.prank(lender);
        line.panic();
        assertTrue(line.recallActive());
        vm.prank(borrower);
        vm.expectRevert(CreditLine.Paused.selector);
        line.draw(1e6);
    }

    function test_ProposeDoesNotChangeCap() public {
        uint256 capBefore = line.cap();
        bytes32 h = _hash(5_000_000e6, 1, bytes32(uint256(7)));
        vm.prank(borrower);
        line.proposeCap(h);
        assertEq(line.cap(), capBefore);
        assertEq(line.proposalHash(), h);
        assertFalse(line.lenderApproved());
        assertFalse(line.borrowerApproved());
    }

    function test_ExecuteWithoutBothApprovalsReverts() public {
        bytes32 h = _hash(5_000_000e6, 1, bytes32(uint256(7)));
        vm.prank(borrower);
        line.proposeCap(h);
        vm.prank(borrower);
        line.approveCap(h);
        vm.prank(borrower);
        vm.expectRevert(CreditLine.NotApproved.selector);
        line.executeCap(5_000_000e6, 1, bytes32(uint256(7)));
    }

    function test_ExecuteWrongSaltReverts() public {
        bytes32 salt = bytes32(uint256(7));
        bytes32 h = _hash(5_000_000e6, 1, salt);
        vm.prank(borrower);
        line.proposeCap(h);
        vm.prank(borrower);
        line.approveCap(h);
        vm.prank(lender);
        line.approveCap(h);
        vm.prank(borrower);
        vm.expectRevert(CreditLine.HashMismatch.selector);
        line.executeCap(5_000_000e6, 1, bytes32(uint256(8)));
    }

    function test_ExecuteUpdatesCap() public {
        bytes32 salt = bytes32(uint256(7));
        uint256 newCap = 5_000_000e6;
        bytes32 h = _hash(newCap, 1, salt);
        vm.prank(borrower);
        line.proposeCap(h);
        vm.prank(borrower);
        line.approveCap(h);
        vm.prank(lender);
        line.approveCap(h);
        vm.prank(borrower);
        line.executeCap(newCap, 1, salt);
        assertEq(line.cap(), newCap);
        assertEq(line.proposalHash(), bytes32(0));
        assertFalse(line.lenderApproved());
        assertFalse(line.borrowerApproved());
    }

    function test_ExecuteCapBelowDrawnReverts() public {
        _draw(400_000e6);
        uint256 newCap = 100_000e6;
        bytes32 salt = bytes32(uint256(3));
        bytes32 h = _hash(newCap, 1, salt);
        vm.prank(lender);
        line.proposeCap(h);
        vm.prank(lender);
        line.approveCap(h);
        vm.prank(borrower);
        line.approveCap(h);
        vm.prank(lender);
        vm.expectRevert(CreditLine.CapBelowDrawn.selector);
        line.executeCap(newCap, 1, salt);
    }

    function test_StrangerCannotDraw() public {
        vm.prank(stranger);
        vm.expectRevert(CreditLine.NotBorrower.selector);
        line.draw(1e6);
    }

    function test_StrangerCannotPanic() public {
        vm.prank(stranger);
        vm.expectRevert(CreditLine.NotLender.selector);
        line.panic();
    }

    function test_StrangerCannotPropose() public {
        vm.prank(stranger);
        vm.expectRevert(CreditLine.NotParty.selector);
        line.proposeCap(bytes32(uint256(1)));
    }

    function test_SwapAllowlistedOk() public {
        _draw(1_000e6);
        vm.prank(borrower);
        vault.swapAllowlisted(address(weth), 1_000e6, 1_000e6);
        assertEq(weth.balanceOf(address(vault)), 1_000e6);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function test_SwapJunkReverts() public {
        _draw(1_000e6);
        vm.prank(borrower);
        vm.expectRevert(BorrowerVault.TokenNotAllowed.selector);
        vault.swapAllowlisted(address(junk), 1_000e6, 0);
    }

    function test_EnterAllowlistedTargetOk() public {
        _draw(100_000e6);
        vm.prank(borrower);
        vault.enterTarget(address(target), 40_000e6);
        assertEq(vault.exposure(address(target)), 40_000e6);
        assertEq(usdc.balanceOf(address(target)), 40_000e6);
        assertEq(usdc.balanceOf(address(vault)), 60_000e6);
    }

    function test_EnterUnknownTargetReverts() public {
        _draw(1_000e6);
        address unknown = makeAddr("unknownVenue");
        vm.prank(borrower);
        vm.expectRevert(BorrowerVault.TargetNotAllowed.selector);
        vault.enterTarget(unknown, 1_000e6);
    }

    function test_RepayReducesDrawn() public {
        _draw(400_000e6);
        vm.prank(borrower);
        vault.repay(100_000e6);
        assertEq(line.drawn(), 300_000e6);
        assertEq(usdc.balanceOf(address(line)), 5_000_000e6 - 300_000e6);
    }

    function test_RepayWorksWhenPaused() public {
        _draw(50_000e6);
        vm.prank(lender);
        line.pauseDraws();
        vm.prank(borrower);
        vault.repay(10_000e6);
        assertEq(line.drawn(), 40_000e6);
    }

    function test_PanicStartsRecall() public {
        vm.prank(lender);
        line.panic();
        assertTrue(line.drawsPaused());
        assertTrue(line.recallActive());
        assertEq(line.recallDeadline(), uint64(block.timestamp + RECALL_WINDOW));
    }

    function test_AfterRecallOnlyRepay() public {
        _draw(80_000e6);
        vm.prank(lender);
        line.panic();
        vm.warp(block.timestamp + RECALL_WINDOW);
        vm.prank(borrower);
        vm.expectRevert(CreditLine.Paused.selector);
        line.draw(1e6);
        vm.prank(borrower);
        vm.expectRevert(BorrowerVault.RecallLocked.selector);
        vault.enterTarget(address(target), 1e6);
        vm.prank(borrower);
        vm.expectRevert(BorrowerVault.RecallLocked.selector);
        vault.swapAllowlisted(address(weth), 1e6, 0);
        vm.prank(borrower);
        vault.repay(10_000e6);
        assertEq(line.drawn(), 70_000e6);
    }

    function test_CannotSweepToBorrowerEoa() public {
        _draw(25_000e6);
        uint256 vaultBal = usdc.balanceOf(address(vault));
        vm.prank(borrower);
        (bool ok,) = address(vault).call(abi.encodeWithSignature("sweep(address)", borrower));
        assertFalse(ok);
        vm.prank(borrower);
        (bool ok2,) = address(usdc).call(
            abi.encodeWithSelector(usdc.transferFrom.selector, address(vault), borrower, vaultBal)
        );
        assertTrue(!ok2 || usdc.balanceOf(borrower) == 0);
        assertEq(usdc.balanceOf(address(vault)), vaultBal);
        assertEq(usdc.balanceOf(borrower), 0);
    }

    function test_SetVenuePausedStartsRecall() public {
        vm.prank(lender);
        line.setVenuePaused(address(target), true);
        assertTrue(line.venuePaused(address(target)));
        assertTrue(line.recallActive());
        assertTrue(line.drawsPaused());
        _drawSetupEnterBlocked();
    }

    function _drawSetupEnterBlocked() internal {
        // draws already paused; entering the paused venue from existing idle funds:
        // first unpause is forbidden while recall is live, so just check enter on empty vault reverts
        vm.prank(borrower);
        vm.expectRevert(BorrowerVault.TargetNotAllowed.selector);
        vault.enterTarget(address(target), 1e6);
    }

    function test_ExitThenRepay() public {
        _draw(50_000e6);
        vm.prank(borrower);
        vault.enterTarget(address(target), 20_000e6);
        vm.prank(borrower);
        vault.exitTarget(address(target), 20_000e6);
        assertEq(vault.exposure(address(target)), 0);
        vm.prank(borrower);
        vault.repay(50_000e6);
        assertEq(line.drawn(), 0);
    }

    function test_ProposeDoesNotEmitNewCap() public {
        bytes32 h = _hash(5_000_000e6, 9, bytes32(uint256(1)));
        vm.prank(lender);
        vm.expectEmit(true, true, false, true);
        emit CreditLine.CapProposed(h, lender);
        line.proposeCap(h);
    }
}
