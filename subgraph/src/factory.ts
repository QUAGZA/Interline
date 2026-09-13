import { MarketCreated } from "../generated/MarketFactory/MarketFactory";
import { FacilityCreated } from "../generated/DirectFacilityFactory/DirectFacilityFactory";
import { LendingMarket, DirectCreditFacility } from "../generated/templates";
import { addr, recordEvent } from "./record";

export function handleMarketCreated(event: MarketCreated): void {
  LendingMarket.create(event.params.market);
  recordEvent(
    event,
    "POOL",
    "MarketCreated",
    event.params.market,
    event.params.loanToken,
    event.params.collateralToken,
    "market=" + addr(event.params.market),
  );
}

export function handleFacilityCreated(event: FacilityCreated): void {
  DirectCreditFacility.create(event.params.facility);
  recordEvent(
    event,
    "DIRECT",
    "FacilityCreated",
    event.params.facility,
    event.params.lender,
    event.params.borrower,
    "facility=" + addr(event.params.facility) + "  lender=" + addr(event.params.lender) + "  borrower=" + addr(event.params.borrower),
  );
}
