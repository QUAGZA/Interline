import { Borrowed, Funded, Repaid, TermsAccepted } from "../generated/templates/DirectCreditFacility/DirectCreditFacility";
import { addr, bytes32, recordEvent, u256 } from "./record";

export function handleTermsAccepted(event: TermsAccepted): void {
  recordEvent(
    event,
    "DIRECT",
    "TermsAccepted",
    event.address,
    event.params.party,
    null,
    "party=" + addr(event.params.party) + "  terms=" + bytes32(event.params.termsHash),
  );
}

export function handleFunded(event: Funded): void {
  recordEvent(
    event,
    "DIRECT",
    "Funded",
    event.address,
    event.params.lender,
    null,
    "lender=" + addr(event.params.lender) + "  assets=" + u256(event.params.assets),
  );
}

export function handleBorrowed(event: Borrowed): void {
  recordEvent(
    event,
    "DIRECT",
    "Borrowed",
    event.address,
    event.params.borrower,
    null,
    "borrower=" + addr(event.params.borrower) + "  assets=" + u256(event.params.assets),
  );
}

export function handleRepaid(event: Repaid): void {
  recordEvent(
    event,
    "DIRECT",
    "Repaid",
    event.address,
    event.params.borrower,
    event.params.payer,
    "borrower=" + addr(event.params.borrower) + "  assets=" + u256(event.params.assets),
  );
}
