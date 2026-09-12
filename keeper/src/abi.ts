import { parseAbi } from "viem";

/** Minimal fragments — keeper has no exclusive ABI surface beyond public market/vault calls. */
export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);

export const faucetAbi = parseAbi(["function drip()"]);

export const factoryAbi = parseAbi([
  "function marketCount() view returns (uint256)",
  "function marketAt(uint256 index) view returns (address)",
]);

export const vaultFactoryAbi = parseAbi([
  "function vaultOf(address market, address owner) view returns (address)",
]);

export const marketAbi = parseAbi([
  "function loanToken() view returns (address)",
  "function deliveryMode() view returns (uint8)",
  "function vaultFactory() view returns (address)",
  "function recallActive() view returns (bool)",
  "function recallDeadline() view returns (uint64)",
  "function debtSharesOf(address owner) view returns (uint256)",
  "function collateralOf(address owner) view returns (uint256)",
  "function healthOf(address owner) view returns (uint8 code, uint256 hfWad, uint256 debt, uint256 liqCapacity, uint256 borrowCapacity_, bool liquidatable)",
  "function previewLiquidation(address owner, uint256 exactDebtShares, uint256 exactCollateral) view returns (uint256 debtSharesBurned, uint256 loanAssetsIn, uint256 collateralOut, bool writesOff)",
  "function liquidate(address owner, uint256 exactDebtShares, uint256 exactCollateral, uint256 maxLoanAssetsIn, uint256 minCollateralOut)",
  "event Borrowed(address indexed owner, uint256 assets, uint256 shares, address destination, uint256 debtAfter)",
]);

export const vaultAbi = parseAbi([
  "function owner() view returns (address)",
  "function adapter() view returns (address)",
  "function publicExitAndRepay(uint256 assets, uint256 maxShares)",
]);

export const adapterAbi = parseAbi(["function venue() view returns (address)"]);

export const erc4626Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function previewRedeem(uint256 shares) view returns (uint256)",
]);
