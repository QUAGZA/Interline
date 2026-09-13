import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import { ProtocolEvent } from "../generated/schema";

const CHAIN_ID = 11155111;

export function recordEvent(
  event: ethereum.Event,
  product: string,
  name: string,
  marketOrFacility: Address | null,
  party: Address | null,
  counterparty: Address | null,
  detail: string,
): void {
  let id = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let row = new ProtocolEvent(id);
  row.chainId = CHAIN_ID;
  row.product = product;
  row.name = name;
  row.contract = event.address;
  row.marketOrFacility = marketOrFacility;
  row.party = party;
  row.counterparty = counterparty;
  row.detail = detail;
  row.txHash = event.transaction.hash;
  row.logIndex = event.logIndex.toI32();
  row.blockNumber = event.block.number;
  row.timestamp = event.block.timestamp;
  row.save();
}

export function addr(value: Address): string {
  return value.toHexString();
}

export function u256(value: BigInt): string {
  return value.toString();
}

export function bytes32(value: Bytes): string {
  return value.toHexString();
}
