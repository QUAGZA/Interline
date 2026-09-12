"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
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
import {
  chainId as expectedChain,
  creditLineAddress,
  junkAddress,
  mockTargetAddress,
  usdcAddress,
  vaultAddress,
  wethAddress,
} from "@/lib/env";
import { errMsg } from "@/lib/errors";
import { parseUsdc } from "@/lib/format";
import { hashCapProposal, toBytes32 } from "@/lib/hash";
import { useLineState } from "@/hooks/useLineState";
import { ScrambleTextOnHover } from "@/components/scramble-text";
import { cn } from "@/lib/utils";

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
    <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full border border-border bg-background px-2 py-1.5 font-mono text-sm text-foreground outline-none focus:border-accent"
      />
    </label>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  danger,
  primary,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  primary?: boolean;
}) {
  const label = typeof children === "string" ? children : null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "border px-3 py-1.5 font-mono text-xs uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-40 transition-colors duration-200",
        danger
          ? "border-destructive bg-destructive text-primary-foreground hover:bg-destructive/80"
          : primary
            ? "border-accent bg-accent text-accent-foreground hover:bg-accent/90"
            : "border-foreground/20 text-foreground hover:border-accent hover:text-accent",
      )}
    >
      {label ? <ScrambleTextOnHover text={label} as="span" duration={0.45} /> : children}
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
    <section id="ops" className="relative py-16 pl-6 md:pl-12 pr-6 md:pr-12 border-t border-border/30">
      <div className="mb-12">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">02 / Ops</span>
        <h2 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">THE DESK</h2>
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          Connected wallet required. Amounts are human USDC (6 decimals). Role:{" "}
          {isLender ? "Lender" : isBorrower ? "Borrower" : isConnected ? "Observer" : "—"}.
        </p>
      </div>

      {!isConnected ? (
        <p className="mb-6 font-mono text-sm text-muted-foreground">
          Connect a wallet to send transactions.{" "}
          <Link href="/connect" className="text-accent hover:underline">
            Connect wallet
          </Link>
        </p>
      ) : !onChain ? (
        <p className="mb-6 font-mono text-sm text-destructive">Switch to chain {expectedChain} to enable writes.</p>
      ) : null}

      {status ? (
        <p className="mb-6 border border-border bg-card px-3 py-2 font-mono text-xs text-foreground/80">
          {status}
          {wait.isLoading ? "  confirming…" : wait.isSuccess ? "  confirmed." : ""}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 border border-border/50 bg-card p-5">
          <h3 className="font-[var(--font-bebas)] text-2xl tracking-tight">Facility</h3>
          <Field label="Amount (USDC)" value={amount} onChange={setAmount} placeholder="400000" />
          <div className="flex flex-wrap gap-2">
            <Btn primary disabled={!writesOn || !isLender || isPending} onClick={deposit}>
              Deposit
            </Btn>
            <Btn
              primary
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
              primary
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

        <div className="space-y-3 border border-border/50 bg-card p-5">
          <h3 className="font-[var(--font-bebas)] text-2xl tracking-tight">Hashed cap</h3>
          <p className="font-mono text-xs text-muted-foreground">
            The new limit is hashed until both sides sign. Then it becomes public.
          </p>
          <Field label="New cap (USDC)" value={newCap} onChange={setNewCap} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Nonce" value={nonce} onChange={setNonce} />
            <Field label="Salt (hex)" value={salt} onChange={setSalt} />
          </div>
          <p className="break-all font-mono text-xs text-accent">
            hash {capHash ?? "(invalid inputs)"}
          </p>
          <p className="font-mono text-[10px] text-muted-foreground">
            On-chain proposal{" "}
            {line.proposalHash && line.proposalHash !== "0x0000000000000000000000000000000000000000000000000000000000000000"
              ? line.proposalHash
              : "none"}{" "}
            · lender {line.lenderApproved ? "signed" : "—"} · borrower {line.borrowerApproved ? "signed" : "—"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Btn
              primary
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
              primary
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
              primary
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

        <div className="space-y-3 border border-border/50 bg-card p-5">
          <h3 className="font-[var(--font-bebas)] text-2xl tracking-tight">Vault use</h3>
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

        <div className="space-y-3 border border-border/50 bg-card p-5">
          <h3 className="font-[var(--font-bebas)] text-2xl tracking-tight">Circuit breaker</h3>
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
