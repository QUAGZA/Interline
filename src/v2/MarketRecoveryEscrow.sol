// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {LendingMarket} from "./LendingMarket.sol";
import {IMarketRecoveryEscrow} from "./interfaces/IMarketRecoveryEscrow.sol";
import {IBorrowerVaultFactory} from "./interfaces/IRestrictedVault.sol";

/// @title MarketRecoveryEscrow
/// @notice Write-off snapshot claims. Later vault recoveries go here, not the defaulted borrower.
contract MarketRecoveryEscrow is ReentrancyGuard, IMarketRecoveryEscrow {
    using SafeERC20 for IERC20;

    struct Episode {
        address market;
        address owner;
        address loanToken;
        uint256 snapshotId;
        uint256 totalShares;
        uint256 debtWritten;
        uint256 recovered;
    }

    address public registrar;
    mapping(address => bool) public isMarket;
    uint256 public episodeCount;
    mapping(uint256 => Episode) public episodes;
    mapping(uint256 => mapping(address => uint256)) public claimed;
    /// @dev latest episode id keyed by market then defaulted owner
    mapping(address => mapping(address => uint256)) public latestEpisodeOf;

    error NotRegistrar();
    error NotMarket();
    error NotVault();
    error ZeroAmount();
    error ZeroAddress();
    error NothingToClaim();

    event MarketRegistered(address indexed market);
    event RegistrarSet(address indexed registrar);
    event WriteOffRecorded(uint256 indexed episodeId, address indexed market, address indexed owner, uint256 debt);
    event Recovered(uint256 indexed episodeId, uint256 assets);
    event Claimed(uint256 indexed episodeId, address indexed supplier, uint256 assets);

    modifier onlyRegistrar() {
        if (msg.sender != registrar) revert NotRegistrar();
        _;
    }

    constructor(address registrar_) {
        if (registrar_ == address(0)) revert ZeroAddress();
        registrar = registrar_;
    }

    function setRegistrar(address next) external onlyRegistrar {
        if (next == address(0)) revert ZeroAddress();
        registrar = next;
        emit RegistrarSet(next);
    }

    function registerMarket(address market) external onlyRegistrar {
        if (market == address(0)) revert ZeroAddress();
        isMarket[market] = true;
        emit MarketRegistered(market);
    }

    function notifyWriteOff(address market, address owner, uint256 snapshotId, uint256 totalShares, uint256 debtWritten)
        external
    {
        if (msg.sender != market || !isMarket[market]) revert NotMarket();
        if (owner == address(0)) revert ZeroAddress();
        unchecked {
            episodeCount++;
        }
        Episode storage e = episodes[episodeCount];
        e.market = market;
        e.owner = owner;
        e.loanToken = address(LendingMarket(market).loanToken());
        e.snapshotId = snapshotId;
        e.totalShares = totalShares;
        e.debtWritten = debtWritten;
        latestEpisodeOf[market][owner] = episodeCount;
        emit WriteOffRecorded(episodeCount, market, owner, debtWritten);
    }

    /// @notice Pull recovered loan tokens from the owner's restricted vault. Not payable to the borrower.
    function notifyRecovery(address market, address owner, uint256 assets) external {
        if (assets == 0) revert ZeroAmount();
        if (!isMarket[market]) revert NotMarket();
        address vault = IBorrowerVaultFactory(address(LendingMarket(market).vaultFactory())).vaultOf(market, owner);
        if (msg.sender != vault) revert NotVault();
        uint256 id = latestEpisodeOf[market][owner];
        Episode storage e = episodes[id];
        if (e.market != market || e.owner != owner) revert NotMarket();
        IERC20(e.loanToken).safeTransferFrom(msg.sender, address(this), assets);
        e.recovered += assets;
        emit Recovered(id, assets);
    }

    function claimable(uint256 episodeId, address supplier) public view returns (uint256) {
        Episode storage e = episodes[episodeId];
        if (e.recovered == 0 || e.totalShares == 0) return 0;
        uint256 shares = LendingMarket(e.market).sharesAtSnapshot(supplier, e.snapshotId);
        uint256 entitled = (shares * e.recovered) / e.totalShares;
        uint256 already = claimed[episodeId][supplier];
        return entitled > already ? entitled - already : 0;
    }

    function claim(uint256 episodeId) external nonReentrant {
        uint256 pay = claimable(episodeId, msg.sender);
        if (pay == 0) revert NothingToClaim();
        Episode storage e = episodes[episodeId];
        uint256 shares = LendingMarket(e.market).sharesAtSnapshot(msg.sender, e.snapshotId);
        claimed[episodeId][msg.sender] = (shares * e.recovered) / e.totalShares;
        IERC20(e.loanToken).safeTransfer(msg.sender, pay);
        emit Claimed(episodeId, msg.sender, pay);
    }
}
