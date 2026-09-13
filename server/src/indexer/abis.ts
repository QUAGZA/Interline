/**
 * TODO: bind from `@interline/protocol` once `tools/export-abis.ts` (Wave 7) writes Foundry `out/` ABIs.
 * Event/view fragments only — do not duplicate contract JSON ABIs here.
 */
import { parseAbi } from "viem";

export const factoryEvents = parseAbi([
  "event MarketCreated(address indexed market, address indexed loanToken, address indexed collateralToken, uint8 deliveryMode)",
]);

export const vaultFactoryEvents = parseAbi([
  "event VaultCreated(address indexed market, address indexed owner, address vault)",
]);

export const marketEvents = parseAbi([
  "event Supplied(address indexed supplier, uint256 assets, uint256 shares, uint256 cashAfter, uint256 assetsAfter)",
  "event Withdrawn(address indexed supplier, uint256 assets, uint256 shares, uint256 cashAfter)",
  "event Redeemed(address indexed supplier, uint256 shares, uint256 assets, uint256 cashAfter)",
  "event CollateralAdded(address indexed owner, address indexed from, uint256 amount)",
  "event CollateralRemoved(address indexed owner, uint256 amount)",
  "event Borrowed(address indexed owner, uint256 assets, uint256 shares, address destination, uint256 debtAfter)",
  "event Repaid(address indexed owner, address indexed payer, uint256 assets, uint256 sharesBurned, uint256 principalPaid, uint256 interestPaid, uint256 roundingSurplus)",
  "event Liquidated(address indexed owner, address indexed liquidator, uint256 debtShares, uint256 loanAssetsIn, uint256 collateralOut, bool writtenOff)",
  "event WrittenOff(address indexed owner, uint256 snapshotId, uint256 debtWritten, uint256 principalArchived)",
  "event Accrued(uint256 indexRay, uint256 aprRay, uint64 timestamp, uint256 utilizationRay)",
  "event RateEpoch(uint256 indexRay, uint256 aprRay, uint64 timestamp)",
  "event SupplyFreezeSet(bool frozen)",
  "event BorrowFreezeSet(bool frozen)",
  "event RecallStarted(bytes32 indexed reasonHash, uint64 deadline, uint64 clearableAt, string reason)",
  "event RecallCleared()",
  "event CuratorTransferStarted(address indexed pending)",
  "event CuratorAccepted(address indexed curator, uint256 epoch)",
  "event GuardianTransferStarted(address indexed pending)",
  "event GuardianAccepted(address indexed guardian)",
  "event CapProposed(bytes32 indexed digest, address indexed owner)",
  "event CapApproved(bytes32 indexed digest)",
  "event PositionCapSet(address indexed owner, uint256 newCap)",
]);

export const vaultEvents = parseAbi([
  "event RepaidFromVault(uint256 amount)",
  "event EnteredVenue(uint256 assets, uint256 shares)",
  "event ExitedVenue(uint256 assets, uint256 shares)",
  "event Swapped(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)",
  "event SurplusReleased(address indexed token, address indexed to, uint256 amount)",
  "event RecoveredToEscrow(uint256 amount)",
]);

export const escrowEvents = parseAbi([
  "event MarketRegistered(address indexed market)",
  "event WriteOffRecorded(uint256 indexed episodeId, address indexed market, address indexed owner, uint256 debt)",
  "event Recovered(uint256 indexed episodeId, uint256 assets)",
  "event Claimed(uint256 indexed episodeId, address indexed supplier, uint256 assets)",
]);

export const directFactoryEvents = parseAbi([
  "event FacilityCreated(address indexed facility, address indexed lender, address indexed borrower, address vault, bytes32 termsHash, address creator)",
]);

export const directFacilityEvents = parseAbi([
  "event TermsAccepted(address indexed party, bytes32 indexed termsHash)",
  "event RequestDeclined(address indexed party)",
  "event RequestCancelled(address indexed party)",
  "event Activated(uint64 activatedAt, uint64 borrowExpiry, uint64 repaymentDueAt)",
  "event Funded(address indexed lender, uint256 assets, uint256 cashAfter)",
  "event CashWithdrawn(address indexed lender, uint256 assets, uint256 cashAfter)",
  "event Borrowed(address indexed borrower, uint256 assets, uint256 shares, uint256 debtAfter)",
  "event Repaid(address indexed borrower, address indexed payer, uint256 assets, uint256 sharesBurned, uint256 principalPaid, uint256 interestPaid, uint256 roundingSurplus)",
  "event BorrowingPaused()",
  "event BorrowingResumed()",
  "event RecallRequested(bytes32 indexed reasonHash, uint64 deadline, uint8 reasonCode)",
  "event RecallCleared()",
  "event CapProposed(bytes32 indexed digest, address indexed proposer, uint256 nonce, uint64 validUntil)",
  "event CapApproved(bytes32 indexed digest, address indexed party)",
  "event CapCancelled(bytes32 indexed digest, address indexed party)",
  "event CapExecuted(uint256 newCap, uint256 nonce)",
  "event AgreementEnded()",
]);

export const allEventAbis = [
  ...factoryEvents,
  ...vaultFactoryEvents,
  ...marketEvents,
  ...vaultEvents,
  ...escrowEvents,
  ...directFactoryEvents,
  ...directFacilityEvents,
] as const;

export const marketViews = parseAbi([
  "function loanToken() view returns (address)",
  "function collateralToken() view returns (address)",
  "function loanDecimals() view returns (uint8)",
  "function collateralDecimals() view returns (uint8)",
  "function deliveryMode() view returns (uint8)",
  "function oracle() view returns (address)",
  "function accountedCash() view returns (uint256)",
  "function totalDebtShares() view returns (uint256)",
  "function totalSupplyShares() view returns (uint256)",
  "function epochIndexRay() view returns (uint256)",
  "function epochTimestamp() view returns (uint64)",
  "function epochAprRay() view returns (uint256)",
  "function supplyCap() view returns (uint256)",
  "function borrowCap() view returns (uint256)",
  "function maxLtvBps() view returns (uint16)",
  "function liquidationThresholdBps() view returns (uint16)",
  "function liquidationBonusBps() view returns (uint16)",
  "function defaultPositionCap() view returns (uint256)",
  "function supplyFrozen() view returns (bool)",
  "function borrowFrozen() view returns (bool)",
  "function marketTerminal() view returns (bool)",
  "function recallActive() view returns (bool)",
  "function recallDeadline() view returns (uint64)",
  "function unaccountedSurplus() view returns (uint256)",
  "function supplySharesOf(address) view returns (uint256)",
  "function debtSharesOf(address) view returns (uint256)",
  "function collateralOf(address) view returns (uint256)",
  "function principalOutstanding(address) view returns (uint256)",
  "function defaulted(address) view returns (bool)",
  "function writtenOffLiability(address) view returns (uint256)",
]);

export const facilityViews = parseAbi([
  "function loanToken() view returns (address)",
  "function lender() view returns (address)",
  "function borrower() view returns (address)",
  "function vault() view returns (address)",
  "function termsHash() view returns (bytes32)",
  "function creditLimit() view returns (uint256)",
  "function accountedCash() view returns (uint256)",
  "function debtShares() view returns (uint256)",
  "function principalOutstanding() view returns (uint256)",
  "function currentDebt() view returns (uint256)",
  "function aprRay() view returns (uint256)",
  "function acceptanceDeadline() view returns (uint64)",
  "function activatedAt() view returns (uint64)",
  "function borrowExpiry() view returns (uint64)",
  "function repaymentDueAt() view returns (uint64)",
  "function lenderAccepted() view returns (bool)",
  "function borrowerAccepted() view returns (bool)",
  "function declined() view returns (bool)",
  "function cancelled() view returns (bool)",
  "function ended() view returns (bool)",
  "function borrowingPaused() view returns (bool)",
  "function recallActive() view returns (bool)",
  "function recallDeadline() view returns (uint64)",
  "function venue() view returns (address)",
  "function swapRouter() view returns (address)",
  "function otherToken() view returns (address)",
  "function borrowPeriod() view returns (uint32)",
  "function recallWindow() view returns (uint32)",
]);

export const erc20Views = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
]);

export const oracleAbi = [
  {
    type: "function",
    name: "quote",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple",
        name: "",
        components: [
          { name: "collateralUsdWad", type: "uint256" },
          { name: "loanUsdWad", type: "uint256" },
          { name: "quoteScale36", type: "uint256" },
          { name: "collateralUpdatedAt", type: "uint256" },
          { name: "loanUpdatedAt", type: "uint256" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
] as const;
