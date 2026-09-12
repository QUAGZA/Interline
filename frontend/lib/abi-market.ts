export const lendingMarketAbi = [
  {
    type: "function",
    name: "supply",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "minSharesOut", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "maxSharesBurn", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "redeem",
    stateMutability: "nonpayable",
    inputs: [
      { name: "shares", type: "uint256" },
      { name: "minAssetsOut", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "addCollateral",
    stateMutability: "nonpayable",
    inputs: [
      { name: "owner", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "removeCollateral",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "borrow",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "maxDebtShares", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "repay",
    stateMutability: "nonpayable",
    inputs: [
      { name: "owner", type: "address" },
      { name: "maxAssets", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "repayAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "owner", type: "address" },
      { name: "maxAssets", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "liquidate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "owner", type: "address" },
      { name: "exactDebtShares", type: "uint256" },
      { name: "exactCollateral", type: "uint256" },
      { name: "maxLoanAssetsIn", type: "uint256" },
      { name: "minCollateralOut", type: "uint256" },
    ],
    outputs: [],
  },
] as const;
