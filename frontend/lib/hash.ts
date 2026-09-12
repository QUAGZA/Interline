import { encodeAbiParameters, isHex, keccak256, pad, type Hex } from "viem";

export function toBytes32(salt: string): Hex {
  const trimmed = salt.trim();
  if (!trimmed) throw new Error("salt required");
  const hex = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!isHex(hex)) throw new Error("salt must be hex");
  return pad(hex as Hex, { size: 32 });
}

export function hashCapProposal(newCap: bigint, nonce: bigint, salt: Hex): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "bytes32" }],
      [newCap, nonce, salt],
    ),
  );
}
