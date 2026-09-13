import { z } from "zod";
import { ChainId, DecimalString, HexAddress, TxHash } from "./primitives";
import { Freshness } from "./freshness";

export const DirectProduct = z.literal("DIRECT");
export const DirectCollateralization = z.literal("OVERCOLLATERALIZED_80");

export const DirectFacility = z.object({
  product: DirectProduct,
  protocolVersion: z.literal("interline-direct-v2"),
  chainId: ChainId,
  facility: HexAddress,
  lender: HexAddress,
  borrower: HexAddress,
  vault: HexAddress,
  asset: z.object({
    address: HexAddress,
    symbol: z.string(),
    decimals: z.number().int(),
  }),
  termsHash: TxHash,
  lenderAccepted: z.boolean(),
  borrowerAccepted: z.boolean(),
  declined: z.boolean(),
  cancelled: z.boolean(),
  ended: z.boolean(),
  acceptanceDeadline: DecimalString,
  activatedAt: DecimalString.nullable(),
  borrowExpiry: DecimalString.nullable(),
  repaymentDueAt: DecimalString.nullable(),
  creditLimitRaw: DecimalString,
  availableCashRaw: DecimalString,
  principalRaw: DecimalString,
  debtRaw: DecimalString,
  accruedInterestRaw: DecimalString,
  fixedAprRay: DecimalString,
  recallDeadline: DecimalString.nullable(),
  borrowingPaused: z.boolean(),
  collateralization: DirectCollateralization,
  healthFactorWad: z.null(),
  priceLiquidatable: z.literal(false),
  freshness: Freshness.optional(),
});
export type DirectFacility = z.infer<typeof DirectFacility>;

export const DirectFacilitiesResponse = z.object({
  facilities: z.array(DirectFacility),
  nextCursor: z.string().nullable(),
  limit: z.number().int(),
});
export type DirectFacilitiesResponse = z.infer<typeof DirectFacilitiesResponse>;

export const DirectFacilityResponse = z.object({
  facility: DirectFacility,
});
export type DirectFacilityResponse = z.infer<typeof DirectFacilityResponse>;
