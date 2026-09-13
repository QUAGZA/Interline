// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILendingMarket} from "./interfaces/ILendingMarket.sol";
import {MarketRecoveryEscrow} from "./MarketRecoveryEscrow.sol";
import {MarketDeployer} from "./MarketDeployer.sol";

/// @title MarketFactory
/// @notice Curator-only listing of reviewed isolated markets. Participation is permissionless.
contract MarketFactory {
    struct Preset {
        address loanToken;
        address collateralToken;
        address oracle;
        uint16 maxLtvBps;
        uint16 liquidationThresholdBps;
        uint16 liquidationBonusBps;
        uint256 supplyCap;
        uint256 borrowCap;
        ILendingMarket.DeliveryMode deliveryMode;
        uint256 defaultPositionCap;
        uint32 recallWindow;
        uint32 recoveryDelay;
        uint256 minBorrow;
        uint256 minSupply;
        address vaultFactory;
        bool enabled;
    }

    address public curator;
    address public pendingCurator;
    address public immutable marketDeployer;
    address[] public allMarkets;
    mapping(address => bool) public isMarket;
    MarketRecoveryEscrow public recoveryEscrow;

    bytes32[] public presetIds;
    mapping(bytes32 => Preset) public presets;
    mapping(bytes32 => bool) public isPreset;

    error NotCurator();
    error ZeroAddress();
    error NotPending();
    error InvalidPreset();
    error EscrowMismatch();
    error UnknownPreset();
    error PresetDisabled();

    event MarketCreated(
        address indexed market, address indexed loanToken, address indexed collateralToken, uint8 deliveryMode
    );
    event PresetRegistered(bytes32 indexed id, uint8 deliveryMode);
    event PresetDisabledSet(bytes32 indexed id, bool enabled);
    event CuratorTransferStarted(address indexed pending);
    event CuratorAccepted(address indexed curator);

    modifier onlyCurator() {
        if (msg.sender != curator) revert NotCurator();
        _;
    }

    constructor(address curator_, address recoveryEscrow_, address marketDeployer_) {
        if (curator_ == address(0) || marketDeployer_ == address(0)) revert ZeroAddress();
        curator = curator_;
        recoveryEscrow = MarketRecoveryEscrow(recoveryEscrow_);
        marketDeployer = marketDeployer_;
    }

    function marketCount() external view returns (uint256) {
        return allMarkets.length;
    }

    function marketAt(uint256 index) external view returns (address) {
        return allMarkets[index];
    }

    function presetCount() external view returns (uint256) {
        return presetIds.length;
    }

    function presetHash(ILendingMarket.Init memory init) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                init.loanToken,
                init.collateralToken,
                init.oracle,
                init.maxLtvBps,
                init.liquidationThresholdBps,
                init.liquidationBonusBps,
                init.supplyCap,
                init.borrowCap,
                init.deliveryMode,
                init.defaultPositionCap,
                init.recallWindow,
                init.recoveryDelay,
                init.minBorrow,
                init.minSupply,
                init.vaultFactory
            )
        );
    }

    /// @notice Review a configuration. `createMarket` may also register the Init as a preset.
    function registerPreset(ILendingMarket.Init memory init) external onlyCurator returns (bytes32 id) {
        _validateInit(init);
        id = presetHash(init);
        if (isPreset[id]) {
            if (!presets[id].enabled) {
                presets[id].enabled = true;
                emit PresetDisabledSet(id, true);
            }
            return id;
        }
        _storePreset(id, init);
        emit PresetRegistered(id, uint8(init.deliveryMode));
    }

    function setPresetEnabled(bytes32 id, bool enabled) external onlyCurator {
        if (!isPreset[id]) revert UnknownPreset();
        presets[id].enabled = enabled;
        emit PresetDisabledSet(id, enabled);
    }

    function createMarket(ILendingMarket.Init memory init) external onlyCurator returns (address market) {
        return _createMarket(init);
    }

    function createMarketFromPreset(bytes32 id, address marketCurator, address guardian, address recoveryEscrow_)
        external
        onlyCurator
        returns (address market)
    {
        if (!isPreset[id]) revert UnknownPreset();
        Preset storage p = presets[id];
        if (!p.enabled) revert PresetDisabled();
        return _createMarket(_initFromPreset(p, marketCurator, guardian, recoveryEscrow_));
    }

    function _initFromPreset(Preset storage p, address marketCurator, address guardian, address recoveryEscrow_)
        internal
        view
        returns (ILendingMarket.Init memory init)
    {
        init.loanToken = p.loanToken;
        init.collateralToken = p.collateralToken;
        init.oracle = p.oracle;
        init.maxLtvBps = p.maxLtvBps;
        init.liquidationThresholdBps = p.liquidationThresholdBps;
        init.liquidationBonusBps = p.liquidationBonusBps;
        init.supplyCap = p.supplyCap;
        init.borrowCap = p.borrowCap;
        init.deliveryMode = p.deliveryMode;
        init.defaultPositionCap = p.defaultPositionCap;
        init.recallWindow = p.recallWindow;
        init.recoveryDelay = p.recoveryDelay;
        init.minBorrow = p.minBorrow;
        init.minSupply = p.minSupply;
        init.curator = marketCurator;
        init.guardian = guardian;
        init.vaultFactory = p.vaultFactory;
        init.recoveryEscrow = recoveryEscrow_;
    }

    function transferCurator(address next) external onlyCurator {
        if (next == address(0)) revert ZeroAddress();
        pendingCurator = next;
        emit CuratorTransferStarted(next);
    }

    function acceptCurator() external {
        if (msg.sender != pendingCurator) revert NotPending();
        curator = msg.sender;
        pendingCurator = address(0);
        emit CuratorAccepted(curator);
    }

    function _createMarket(ILendingMarket.Init memory init) internal returns (address market) {
        _validateInit(init);
        bytes32 id = presetHash(init);
        if (isPreset[id]) {
            if (!presets[id].enabled) revert PresetDisabled();
        } else {
            _storePreset(id, init);
            emit PresetRegistered(id, uint8(init.deliveryMode));
        }
        market = MarketDeployer(marketDeployer).deploy(init);
        allMarkets.push(market);
        isMarket[market] = true;
        if (address(recoveryEscrow) != address(0)) {
            recoveryEscrow.registerMarket(market);
        }
        emit MarketCreated(market, init.loanToken, init.collateralToken, uint8(init.deliveryMode));
    }

    function _storePreset(bytes32 id, ILendingMarket.Init memory init) internal {
        isPreset[id] = true;
        presetIds.push(id);
        presets[id] = Preset({
            loanToken: init.loanToken,
            collateralToken: init.collateralToken,
            oracle: init.oracle,
            maxLtvBps: init.maxLtvBps,
            liquidationThresholdBps: init.liquidationThresholdBps,
            liquidationBonusBps: init.liquidationBonusBps,
            supplyCap: init.supplyCap,
            borrowCap: init.borrowCap,
            deliveryMode: init.deliveryMode,
            defaultPositionCap: init.defaultPositionCap,
            recallWindow: init.recallWindow,
            recoveryDelay: init.recoveryDelay,
            minBorrow: init.minBorrow,
            minSupply: init.minSupply,
            vaultFactory: init.vaultFactory,
            enabled: true
        });
    }

    function _validateInit(ILendingMarket.Init memory init) internal view {
        if (init.loanToken == address(0) || init.collateralToken == address(0) || init.oracle == address(0)) {
            revert ZeroAddress();
        }
        if (init.curator == address(0) || init.guardian == address(0)) revert ZeroAddress();
        if (init.loanToken == init.collateralToken) revert InvalidPreset();
        if (init.defaultPositionCap == 0 || init.defaultPositionCap > init.borrowCap) revert InvalidPreset();
        if (init.deliveryMode == ILendingMarket.DeliveryMode.Restricted) {
            if (init.vaultFactory == address(0)) revert InvalidPreset();
        } else if (init.vaultFactory != address(0)) {
            revert InvalidPreset();
        }
        if (init.recoveryEscrow != address(recoveryEscrow)) revert EscrowMismatch();
    }
}
