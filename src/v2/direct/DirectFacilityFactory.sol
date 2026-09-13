// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {InterestMath} from "../libraries/InterestMath.sol";
import {IDirectCreditFacility} from "./interfaces/IDirectCreditFacility.sol";
import {DirectFacilityDeployer} from "./DirectFacilityDeployer.sol";
import {DirectCreditFacility} from "./DirectCreditFacility.sol";

/// @title DirectFacilityFactory
/// @notice Permissionless bilateral facility create. Listing is a directory, not curator approval of the loan.
contract DirectFacilityFactory {
    error ZeroAddress();
    error WrongParty();
    error SameParty();
    error InvalidTerms();
    error UnsupportedAsset();
    error UnsupportedRecallWindow();

    event FacilityCreated(
        address indexed facility,
        address indexed lender,
        address indexed borrower,
        address vault,
        bytes32 termsHash,
        address creator
    );

    address public immutable loanToken;
    address public immutable venue;
    address public immutable swapRouter;
    address public immutable otherToken;
    address public immutable oracle;
    address public immutable vaultFactory;
    address public immutable facilityDeployer;

    uint256 public constant MIN_LIMIT = 1e6;
    uint256 public constant MAX_LIMIT = 1_000_000e6;
    uint32 public constant MIN_ACCEPT = 1 hours;
    uint32 public constant MAX_ACCEPT = 7 days;
    uint32 public constant MIN_PERIOD = 1 days;
    uint32 public constant MAX_PERIOD = 365 days;
    uint32 public constant ANVIL_RECALL = 5 minutes;

    address[] internal _facilities;
    mapping(address => bool) public isFacility;

    constructor(
        address loanToken_,
        address venue_,
        address swapRouter_,
        address otherToken_,
        address oracle_,
        address vaultFactory_,
        address facilityDeployer_
    ) {
        if (
            loanToken_ == address(0) || venue_ == address(0) || swapRouter_ == address(0) || otherToken_ == address(0)
                || oracle_ == address(0) || vaultFactory_ == address(0) || facilityDeployer_ == address(0)
        ) {
            revert ZeroAddress();
        }
        if (IERC4626(venue_).asset() != loanToken_) revert UnsupportedAsset();
        loanToken = loanToken_;
        venue = venue_;
        swapRouter = swapRouter_;
        otherToken = otherToken_;
        oracle = oracle_;
        vaultFactory = vaultFactory_;
        facilityDeployer = facilityDeployer_;
    }

    function facilityCount() external view returns (uint256) {
        return _facilities.length;
    }

    function facilityAt(uint256 index) external view returns (address) {
        return _facilities[index];
    }

    function createFacility(IDirectCreditFacility.Terms calldata terms) external returns (address facility) {
        if (msg.sender != terms.lender && msg.sender != terms.borrower) revert WrongParty();
        _validate(terms);
        DirectCreditFacility deployed = DirectCreditFacility(
            DirectFacilityDeployer(facilityDeployer).deploy(terms, msg.sender, oracle, vaultFactory)
        );
        facility = address(deployed);
        isFacility[facility] = true;
        _facilities.push(facility);
        emit FacilityCreated(facility, terms.lender, terms.borrower, deployed.vault(), deployed.termsHash(), msg.sender);
    }

    function _validate(IDirectCreditFacility.Terms calldata t) internal view {
        if (t.lender == address(0) || t.borrower == address(0)) revert ZeroAddress();
        if (t.lender == t.borrower) revert SameParty();
        if (t.loanToken != loanToken) revert UnsupportedAsset();
        if (t.venue != venue || t.swapRouter != swapRouter || t.otherToken != otherToken) revert UnsupportedAsset();
        if (t.creditLimit < MIN_LIMIT || t.creditLimit > MAX_LIMIT) revert InvalidTerms();
        if (t.aprRay > InterestMath.RAY) revert InvalidTerms();
        if (t.acceptanceLifetime < MIN_ACCEPT || t.acceptanceLifetime > MAX_ACCEPT) revert InvalidTerms();
        if (t.borrowPeriod < MIN_PERIOD || t.borrowPeriod > MAX_PERIOD) revert InvalidTerms();
        if (!_recallWindowOk(t.recallWindow)) revert UnsupportedRecallWindow();
        uint8 dec = IERC20Metadata(t.loanToken).decimals();
        if (dec < 6 || dec > 18) revert InvalidTerms();
    }

    function _recallWindowOk(uint32 window) internal view returns (bool) {
        if (window == 1 hours || window == 6 hours || window == 24 hours || window == 72 hours) return true;
        if (block.chainid == 31337 && window == ANVIL_RECALL) return true;
        return false;
    }
}
