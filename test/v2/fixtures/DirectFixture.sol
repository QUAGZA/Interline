// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RestrictedFixture} from "./RestrictedFixture.sol";
import {DirectFacilityFactory} from "../../../src/v2/direct/DirectFacilityFactory.sol";
import {DirectFacilityDeployer} from "../../../src/v2/direct/DirectFacilityDeployer.sol";
import {DirectCreditFacility} from "../../../src/v2/direct/DirectCreditFacility.sol";
import {DirectFacilityLens} from "../../../src/v2/direct/DirectFacilityLens.sol";
import {IDirectCreditFacility} from "../../../src/v2/direct/interfaces/IDirectCreditFacility.sol";
import {BorrowerVaultV2} from "../../../src/v2/BorrowerVaultV2.sol";

contract DirectFixture is RestrictedFixture {
    DirectFacilityFactory internal directFactory;
    DirectFacilityLens internal directLens;

    uint256 internal constant DIRECT_APR = 5e25;

    function _deployDirectStack() internal {
        _deployRestricted();
        directFactory = new DirectFacilityFactory(
            address(musdc),
            address(venue),
            address(router),
            address(mweth),
            address(oracle),
            address(vaultFactory),
            address(new DirectFacilityDeployer())
        );
        directLens = new DirectFacilityLens();
    }

    function _terms(address lender_, address borrower_) internal view returns (IDirectCreditFacility.Terms memory t) {
        t.lender = lender_;
        t.borrower = borrower_;
        t.loanToken = address(musdc);
        t.creditLimit = 5_000e6;
        t.aprRay = DIRECT_APR;
        t.acceptanceLifetime = 1 hours;
        t.borrowPeriod = 365 days;
        t.recallWindow = 300;
        t.venue = address(venue);
        t.swapRouter = address(router);
        t.otherToken = address(mweth);
    }

    function _create(address creator, IDirectCreditFacility.Terms memory t) internal returns (DirectCreditFacility) {
        vm.prank(creator);
        return DirectCreditFacility(directFactory.createFacility(t));
    }

    function _accept(DirectCreditFacility fac, address party) internal {
        bytes32 hash = fac.termsHash();
        vm.prank(party);
        fac.acceptTerms(hash);
    }

    function _createAccepted(address lender_, address borrower_) internal returns (DirectCreditFacility fac) {
        IDirectCreditFacility.Terms memory t = _terms(lender_, borrower_);
        fac = _create(lender_, t);
        _accept(fac, borrower_);
        _postCollateral(fac, borrower_, 10 ether);
    }

    function _postCollateral(DirectCreditFacility fac, address from, uint256 amount) internal {
        mweth.mint(from, amount);
        vm.startPrank(from);
        mweth.approve(address(fac), amount);
        fac.addCollateral(amount);
        vm.stopPrank();
    }

    function _refreshOracle() internal {
        usdcFeed.setAnswer(1e8);
        wethFeed.setAnswer(wethFeed.answer());
    }

    function _fundLender(DirectCreditFacility fac, address lender_, uint256 amount) internal {
        musdc.mint(lender_, amount);
        vm.startPrank(lender_);
        musdc.approve(address(fac), amount);
        fac.fund(amount);
        vm.stopPrank();
    }
}
