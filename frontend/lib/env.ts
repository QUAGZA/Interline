export const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337");
export const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";

export const lenderLabel = process.env.NEXT_PUBLIC_LENDER_LABEL ?? "lender.interline.eth";
export const borrowerLabel = process.env.NEXT_PUBLIC_BORROWER_LABEL ?? "borrower.interline.eth";
export const walletConnectProjectId = (process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "").trim();

function asAddress(value?: string): `0x${string}` | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) return undefined;
  if (v === "0x0000000000000000000000000000000000000000") return undefined;
  return v as `0x${string}`;
}

export const creditLineAddress = asAddress(process.env.NEXT_PUBLIC_CREDIT_LINE_ADDRESS);
export const vaultAddress = asAddress(process.env.NEXT_PUBLIC_VAULT_ADDRESS);
export const usdcAddress = asAddress(process.env.NEXT_PUBLIC_USDC_ADDRESS);
export const wethAddress = asAddress(process.env.NEXT_PUBLIC_WETH_ADDRESS);
export const junkAddress = asAddress(process.env.NEXT_PUBLIC_JUNK_ADDRESS);
export const mockTargetAddress = asAddress(process.env.NEXT_PUBLIC_MOCK_TARGET_ADDRESS);

export const addressesReady = Boolean(
  creditLineAddress && vaultAddress && usdcAddress && wethAddress && junkAddress && mockTargetAddress,
);
