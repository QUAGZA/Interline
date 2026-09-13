import { Borrowed, Liquidated, Repaid, Supplied, Withdrawn } from "../generated/templates/LendingMarket/LendingMarket";
import { addr, recordEvent, u256 } from "./record";

export function handleSupplied(event: Supplied): void {
  recordEvent(
    event,
    "POOL",
    "Supplied",
    event.address,
    event.params.supplier,
    null,
    "supplier=" + addr(event.params.supplier) + "  assets=" + u256(event.params.assets),
  );
}

export function handleWithdrawn(event: Withdrawn): void {
  recordEvent(
    event,
    "POOL",
    "Withdrawn",
    event.address,
    event.params.supplier,
    null,
    "supplier=" + addr(event.params.supplier) + "  assets=" + u256(event.params.assets),
  );
}

export function handleBorrowed(event: Borrowed): void {
  recordEvent(
    event,
    "POOL",
    "Borrowed",
    event.address,
    event.params.owner,
    event.params.destination,
    "owner=" + addr(event.params.owner) + "  assets=" + u256(event.params.assets),
  );
}

export function handleRepaid(event: Repaid): void {
  recordEvent(
    event,
    "POOL",
    "Repaid",
    event.address,
    event.params.owner,
    event.params.payer,
    "owner=" + addr(event.params.owner) + "  assets=" + u256(event.params.assets),
  );
}

export function handleLiquidated(event: Liquidated): void {
  recordEvent(
    event,
    "POOL",
    "Liquidated",
    event.address,
    event.params.owner,
    event.params.liquidator,
    "owner=" + addr(event.params.owner) + "  liquidator=" + addr(event.params.liquidator),
  );
}
