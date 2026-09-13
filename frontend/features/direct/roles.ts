import type { DirectFacilityDto } from "./dto";

export type DirectRoles = {
  isLender: boolean;
  isBorrower: boolean;
  isCounterparty: boolean;
};

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

export function rolesFor(
  facility: { lender: string; borrower: string },
  connectedAddress?: string,
): DirectRoles {
  if (!connectedAddress) return { isLender: false, isBorrower: false, isCounterparty: false };
  const a = connectedAddress.toLowerCase();
  const isLender = facility.lender.toLowerCase() === a;
  const isBorrower = facility.borrower.toLowerCase() === a;
  return { isLender, isBorrower, isCounterparty: isLender || isBorrower };
}

export function publicRecoveryOpen(
  facility: Pick<DirectFacilityDto, "recallDeadline" | "repaymentDueAt" | "ended">,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  if (facility.ended) return false;
  const recall = facility.recallDeadline ? Number(facility.recallDeadline) : 0;
  const due = facility.repaymentDueAt ? Number(facility.repaymentDueAt) : 0;
  const effective = recall && due ? Math.min(recall, due) : recall || due;
  return Number.isFinite(effective) && effective !== 0 && nowSec > effective;
}

export function recallRequested(recallReasonHash?: `0x${string}` | null): boolean {
  return Boolean(recallReasonHash && recallReasonHash !== ZERO_HASH);
}

export function borrowExpired(facility: Pick<DirectFacilityDto, "borrowExpiry">, nowSec = Math.floor(Date.now() / 1000)) {
  const exp = facility.borrowExpiry ? Number(facility.borrowExpiry) : 0;
  return exp !== 0 && nowSec >= exp;
}

export function canSettleDefault(args: {
  facility: Pick<DirectFacilityDto, "recallDeadline" | "repaymentDueAt" | "ended" | "debtRaw">;
  collateralPosted?: bigint;
  nowSec?: number;
}): boolean {
  if (args.facility.ended) return false;
  if (safeBig(args.facility.debtRaw) === 0n) return false;
  if (!args.collateralPosted || args.collateralPosted === 0n) return false;
  return publicRecoveryOpen(args.facility, args.nowSec);
}

export function nextActionText(args: {
  facility: DirectFacilityDto;
  roles: DirectRoles;
  idleLoan?: bigint;
  venueShares?: bigint;
  otherIdle?: bigint;
  collateralPosted?: bigint;
  recallStarted?: boolean;
  nowSec?: number;
}): string {
  const { facility, roles } = args;
  const now = args.nowSec ?? Math.floor(Date.now() / 1000);
  const debt = safeBig(facility.debtRaw);
  const cash = safeBig(facility.availableCashRaw);
  const idle = args.idleLoan ?? 0n;
  const shares = args.venueShares ?? 0n;
  const other = args.otherIdle ?? 0n;
  const posted = args.collateralPosted ?? 0n;
  const recalled = args.recallStarted ?? Boolean(facility.recallDeadline);
  const recovery = publicRecoveryOpen(facility, now);
  const settle = canSettleDefault({ facility, collateralPosted: posted, nowSec: now });

  if (facility.ended) return "Agreement ended. No further cash moves.";
  if (facility.declined) return "Request declined. Create a new agreement if you still want to proceed.";
  if (facility.cancelled) return "Request cancelled. Create a new agreement if you still want to proceed.";
  if (!facility.lenderAccepted || !facility.borrowerAccepted) {
    if (roles.isLender && facility.lenderAccepted && !facility.borrowerAccepted) {
      return `Waiting on ${short(facility.borrower)} to accept. Switch to that wallet in this app and open Direct lending.`;
    }
    if (roles.isBorrower && facility.borrowerAccepted && !facility.lenderAccepted) {
      return `Waiting on ${short(facility.lender)} to accept. Switch to that wallet in this app and open Direct lending.`;
    }
    if (roles.isLender && !facility.lenderAccepted) return "Accept terms to proceed.";
    if (roles.isBorrower && !facility.borrowerAccepted) return "Accept terms to proceed.";
    return "Named party must accept terms before cash can move.";
  }
  if (roles.isLender) {
    if (recalled && debt === 0n) return "Debt is cleared — clear the recall, then withdraw remaining cash or end the agreement.";
    if (recalled && debt > 0n) {
      if (settle) {
        return "Public recovery is open — settle posted mWETH against remaining debt, or recover vault idle / venue first.";
      }
      return recovery
        ? "Recall window passed — recover venue or idle vault cash, or wait for the borrower to repay."
        : "Recall is active. New borrowing is stopped. Wait for repayment or public recovery after the deadline.";
    }
    if (facility.borrowingPaused && !recalled && !borrowExpired(facility, now)) {
      return "New borrowing is paused. Resume when ready, or fund / withdraw idle cash.";
    }
    if (cash === 0n && debt === 0n) return `Fund this agreement so ${short(facility.borrower)} can borrow into their vault.`;
    return "Fund agreement, withdraw idle cash, pause new borrowing, or request repayment.";
  }
  if (roles.isBorrower) {
    if (shares > 0n) return "Withdraw from the reviewed venue into the vault, then repay from vault idle.";
    if (idle > 0n && debt > 0n) return "Vault idle can repay this agreement — choose Agreement vault as the repay source.";
    if (debt > 0n) return `Repay ${short(facility.lender)} from your wallet or vault idle after any venue exit.`;
    if (idle > 0n || other > 0n) return "Debt is cleared — release settled surplus from the vault to your wallet.";
    return "Post mWETH collateral, then borrow into the vault (max 80% LTV), or use the reviewed venue.";
  }
  if (recovery) {
    return settle
      ? "Public recovery is open: settle posted collateral, repay from vault idle, recover venue shares, or reverse-unwind. Wallet repay is always allowed."
      : "Public recovery is open: repay from vault idle, recover venue shares, or reverse-unwind other tokens. Wallet repay is always allowed.";
  }
  return "Observer view — connect a named party wallet to act. Anyone may repay from their own wallet; that payer gets no ownership rights.";
}

function safeBig(raw: string) {
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
}

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
