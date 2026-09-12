"use client";

import { useMemo, useState, type ReactNode } from "react";
import { erc20Abi, type Hex } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWaitForTransactionReceipt,
  useWalletClient,
  useWriteContract,
} from "wagmi";
import { creditLineAbi, vaultAbi } from "@/lib/abi";
import { chainId as expectedChain, creditLineAddress, junkAddress, mockTargetAddress, usdcAddress, vaultAddress, wethAddress } from "@/lib/env";
import { errMsg } from "@/lib/errors";
import { parseUsdc } from "@/lib/format";
import { hashCapProposal, toBytes32 } from "@/lib/hash";
import { useLineState } from "@/hooks/useLineState";

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-xs text-zinc-400">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-sm text-zinc-100 outline-none focus:border-amber-400"
      />
    </label>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? "bg-red-500 text-white hover:bg-red-400"
          : "bg-amber-400 text-zinc-950 hover:bg-amber-300"
      }`}
    >
      {children}
    </button>
  );
}

export function OpsPanel() {
  const { address, isConnected, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const line = useLineState();
  const { writeContractAsync, data: hash, isPending, reset } = useWriteContract();
  const wait = useWaitForTransactionReceipt({ hash });
  const [status, setStatus] = useState<string>("");
  const [amount, setAmount] = useState("400000");
  const [newCap, setNewCap] = useState("5000000");
  const [nonce, setNonce] = useState("1");
  const [salt, setSalt] = useState("0x01");
  const [enterAmt, setEnterAmt] = useState("100000");
  const [swapAmt, setSwapAmt] = useState("1000");

  const onChain = isConnected && chainId === expectedChain;
  const isLender = Boolean(address && line.lender && address.toLowerCase() === line.lender.toLowerCase());
  const isBorrower = Boolean(address && line.borrower && address.toLowerCase() === line.borrower.toLowerCase());
  const isParty = isLender || isBorrower;
  const writesOn = onChain && Boolean(creditLineAddress && vaultAddress && usdcAddress);

  const { data: allowance } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && creditLineAddress ? [address, creditLineAddress] : undefined,
    query: { enabled: Boolean(address && usdcAddress && creditLineAddress) },
  });

  const capHash = useMemo(() => {
    try {
      return hashCapProposal(parseUsdc(newCap), BigInt(nonce || "0"), toBytes32(salt));
    } catch {
      return undefined;
    }
  }, [newCap, nonce, salt]);

  async function run(label: string, fn: () => Promise<Hex>) {
    setStatus(`${label}…`);
    try {
      const tx = await fn();
      setStatus(`${label} submitted ${tx.slice(0, 10)}…`);
    } catch (e) {
      setStatus(`${label} failed: ${errMsg(e)}`);
    }
  }

  async function deposit() {
    const usdc = usdcAddress;
    const lineAddr = creditLineAddress;
    if (!usdc || !lineAddr || !address) return;
    const amt = parseUsdc(amount);
    await run("Deposit", async () => {
      if ((allowance ?? 0n) < amt) {
        await writeContractAsync({
          address: usdc,
          abi: erc20Abi,
          functionName: "approve",
          args: [lineAddr, amt],
        });
        reset();
      }
      return writeContractAsync({
        address: lineAddr,
        abi: creditLineAbi,
        functionName: "deposit",
        args: [amt],
      });
    });
  }

  return (
    <section className="space-y-6 border-t border-zinc-800 p-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Ops</h2>
        <p className="text-xs text-zinc-500">
          Connected wallet required. Amounts are human USDC (6 decimals). Role:{" "}
          {isLender ? "Lender" : isBorrower ? "Borrower" : isConnected ? "Observer" : "—"}.
        </p>
      </div>

      {!isConnected ? (
        <p className="text-sm text-zinc-500">Connect a wallet to send transactions.</p>
      ) : !onChain ? (
        <p className="text-sm text-red-300">Switch to chain {expectedChain} to enable writes.</p>
      ) : null}

      {status ? (
        <p className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-300">
          {status}
          {wait.isLoading ? "  confirming…" : wait.isSuccess ? "  confirmed." : ""}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-zinc-800 p-4">
          <h3 className="text-sm font-medium text-zinc-200">Facility</h3>
          <Field label="Amount (USDC)" value={amount} onChange={setAmount} placeholder="400000" />
          <div className="flex flex-wrap gap-2">
            <Btn disabled={!writesOn || !isLender || isPending} onClick={deposit}>
              Deposit
            </Btn>
            <Btn
              disabled={!writesOn || !isBorrower || isPending}
              onClick={() =>
                run("Draw", () =>
                  writeContractAsync({
                    address: creditLineAddress!,
                    abi: creditLineAbi,
                    functionName: "draw",
                    args: [parseUsdc(amount)],
                  }),
                )
              }
            >
              Draw
            </Btn>
            <Btn
              disabled={!writesOn || !isBorrower || isPending}
              onClick={() =>
                run("Repay", () =>
                  writeContractAsync({
                    address: vaultAddress!,
                    abi: vaultAbi,
                    functionName: "repay",
                    args: [parseUsdc(amount)],
                  }),
                )
              }
            >
              Repay
            </Btn>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-zinc-800 p-4">
          <h3 className="text-sm font-medium text-zinc-200">Hashed cap</h3>
          <Field label="New cap (USDC)" value={newCap} onChange={setNewCap} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Nonce" value={nonce} onChange={setNonce} />
            <Field label="Salt (hex)" value={salt} onChange={setSalt} />
          </div>
          <p className="break-all font-mono text-xs text-amber-300">
            hash {capHash ?? "(invalid inputs)"}
          </p>
          <p className="text-xs text-zinc-500">
            On-chain proposal {line.proposalHash && line.proposalHash !== "0x0000000000000000000000000000000000000000000000000000000000000000" ? line.proposalHash : "none"} · lender{" "}
            {line.lenderApproved ? "signed" : "—"} · borrower {line.borrowerApproved ? "signed" : "—"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Btn
              disabled={!writesOn || !isParty || !capHash || isPending}
              onClick={() =>
                run("Propose", () =>
                  writeContractAsync({
                    address: creditLineAddress!,
                    abi: creditLineAbi,
                    functionName: "proposeCap",
                    args: [capHash!],
                  }),
                )
              }
            >
              Propose
            </Btn>
            <Btn
              disabled={!writesOn || !isParty || !capHash || isPending}
              onClick={() =>
                run("Approve", () =>
                  writeContractAsync({
                    address: creditLineAddress!,
                    abi: creditLineAbi,
                    functionName: "approveCap",
                    args: [capHash!],
                  }),
                )
              }
            >
              Approve
            </Btn>
            <Btn
              disabled={!writesOn || !isParty || !capHash || isPending}
              onClick={() =>
                run("Execute", () =>
                  writeContractAsync({
                    address: creditLineAddress!,
                    abi: creditLineAbi,
                    functionName: "executeCap",
                    args: [parseUsdc(newCap), BigInt(nonce), toBytes32(salt)],
                  }),
                )
              }
            >
              Execute
            </Btn>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-zinc-800 p-4">
          <h3 className="text-sm font-medium text-zinc-200">Vault use</h3>
          <Field label="Enter / exit amount (USDC)" value={enterAmt} onChange={setEnterAmt} />
          <Field label="Swap amount (USDC in, 1:1 raw)" value={swapAmt} onChange={setSwapAmt} />
          <div className="flex flex-wrap gap-2">
            <Btn
              disabled={!writesOn || !isBorrower || isPending}
              onClick={() =>
                run("Enter target", () =>
                  writeContractAsync({
                    address: vaultAddress!,
                    abi: vaultAbi,
                    functionName: "enterTarget",
                    args: [mockTargetAddress!, parseUsdc(enterAmt)],
                  }),
                )
              }
            >
              Enter target
            </Btn>
            <Btn
              disabled={!writesOn || !isBorrower || isPending}
              onClick={() =>
                run("Exit target", () =>
                  writeContractAsync({
                    address: vaultAddress!,
                    abi: vaultAbi,
                    functionName: "exitTarget",
                    args: [mockTargetAddress!, parseUsdc(enterAmt)],
                  }),
                )
              }
            >
              Exit target
            </Btn>
            <Btn
              disabled={!writesOn || !isBorrower || isPending}
              onClick={() =>
                run("Swap WETH", () =>
                  writeContractAsync({
                    address: vaultAddress!,
                    abi: vaultAbi,
                    functionName: "swapAllowlisted",
                    args: [wethAddress!, parseUsdc(swapAmt), parseUsdc(swapAmt)],
                  }),
                )
              }
            >
              Swap WETH
            </Btn>
            <Btn
              danger
              disabled={!writesOn || !isBorrower || isPending}
              onClick={() =>
                run("Swap JUNK", () =>
                  writeContractAsync({
                    address: vaultAddress!,
                    abi: vaultAbi,
                    functionName: "swapAllowlisted",
                    args: [junkAddress!, parseUsdc(swapAmt), 0n],
                  }),
                )
              }
            >
              Swap JUNK (must fail)
            </Btn>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-zinc-800 p-4">
          <h3 className="text-sm font-medium text-zinc-200">Circuit breaker</h3>
          <div className="flex flex-wrap gap-2">
            <Btn
              danger
              disabled={!writesOn || !isLender || isPending}
              onClick={() =>
                run("Panic", () =>
                  writeContractAsync({
                    address: creditLineAddress!,
                    abi: creditLineAbi,
                    functionName: "panic",
                  }),
                )
              }
            >
              Panic
            </Btn>
            <Btn
              danger
              disabled={!writesOn || !isLender || isPending}
              onClick={() =>
                run("Pause venue", () =>
                  writeContractAsync({
                    address: creditLineAddress!,
                    abi: creditLineAbi,
                    functionName: "setVenuePaused",
                    args: [mockTargetAddress!, true],
                  }),
                )
              }
            >
              Set venue paused
            </Btn>
            <Btn
              disabled={!writesOn || !isLender || isPending}
              onClick={() =>
                run("Clear recall", () =>
                  writeContractAsync({
                    address: creditLineAddress!,
                    abi: creditLineAbi,
                    functionName: "clearRecall",
                  }),
                )
              }
            >
              Clear recall
            </Btn>
            <Btn
              disabled={!writesOn || !isLender || isPending}
              onClick={() =>
                run("Unpause draws", () =>
                  writeContractAsync({
                    address: creditLineAddress!,
                    abi: creditLineAbi,
                    functionName: "unpauseDraws",
                  }),
                )
              }
            >
              Unpause draws
            </Btn>
            {expectedChain === 31337 ? (
              <Btn
                disabled={!onChain || isPending}
                onClick={async () => {
                  setStatus("Anvil fast-forward…");
                  try {
                    const seconds = Number(line.recallWindow ?? 300n);
                    const provider = walletClient ?? publicClient;
                    if (!provider) throw new Error("no client");
                    const rpc = provider as unknown as {
                      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
                    };
                    await rpc.request({ method: "evm_increaseTime", params: [seconds] });
                    await rpc.request({ method: "evm_mine", params: [] });
                    setStatus(`Warped +${seconds}s (Anvil only)`);
                  } catch (e) {
                    setStatus(`Fast-forward failed: ${errMsg(e)}`);
                  }
                }}
              >
                Fast-forward recall (Anvil)
              </Btn>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
