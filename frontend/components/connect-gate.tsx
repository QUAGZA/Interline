"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, useConnect, useSwitchChain } from "wagmi";
import { AnimatedNoise } from "@/components/animated-noise";
import { BitmapChevron } from "@/components/bitmap-chevron";
import { DisconnectButton } from "@/components/connect-button";
import { EnsLabel } from "@/components/ens-label";
import { useCatalogChainId } from "@/lib/use-catalog-chain";
import { chainName } from "@/lib/chains";
import { walletConnectProjectId } from "@/lib/env";
import { sanitizeReturnUrl } from "@/lib/return-url";
import { cn } from "@/lib/utils";

function connectorLabel(id: string, name: string): string {
  if (id === "walletConnect") return "WalletConnect / Ledger Live";
  if (id === "injected" && (name === "Injected" || name === "Browser Wallet")) return "Browser wallet";
  return name;
}

export function ConnectGate() {
  const search = useSearchParams();
  const router = useRouter();
  const returnTo = sanitizeReturnUrl(search.get("return") ?? undefined) ?? "/dashboard";
  const { address, isConnected, chain, chainId } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const catalogChain = useCatalogChainId();
  const onPreferred = isConnected && chainId === catalogChain;

  return (
    <section className="relative min-h-[calc(100vh-3.5rem)] flex items-center pl-6 md:pl-16 pr-6 md:pr-12">
      <AnimatedNoise opacity={0.03} />
      <div className="relative z-10 w-full max-w-xl">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">00 / Connect</span>
        <h1 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">CONNECT</h1>
        <p className="mt-6 max-w-md font-mono text-sm text-muted-foreground leading-relaxed">
          Optional for browsing markets and the public desk. Required only to supply, borrow, or manage a position.
        </p>
        <p className="mt-4 max-w-md font-mono text-xs text-foreground/70 leading-relaxed">
          After connecting you return to{" "}
          <code className="text-accent">{returnTo}</code>. Any wallet can participate — there is no lender/borrower whitelist.
        </p>
        <p className="mt-3 max-w-md font-mono text-xs text-muted-foreground leading-relaxed">
          Browser wallets including MetaMask and Ledger-through-MetaMask.
          {walletConnectProjectId ? " Ledger Live connects through WalletConnect." : null}
        </p>

        {!isConnected ? (
          <div className="mt-12 space-y-3">
            {connectors.map((c) => (
              <button
                key={c.uid}
                type="button"
                disabled={isPending}
                onClick={() => connect({ connector: c })}
                className="group flex w-full items-center justify-between border border-foreground/20 px-6 py-4 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent disabled:opacity-50"
              >
                <span>Connect {connectorLabel(c.id, c.name)}</span>
                <BitmapChevron className="transition-transform duration-[400ms] ease-in-out group-hover:rotate-45" />
              </button>
            ))}
            {error ? <p className="font-mono text-xs text-destructive">{error.message}</p> : null}
          </div>
        ) : (
          <div className="mt-12 space-y-6">
            <div className="border border-border/50 bg-card p-5 space-y-3">
              <span className={cn("inline-block border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest border-accent text-accent")}>
                Connected
              </span>
              <p className="font-mono text-sm text-foreground">
                <EnsLabel address={address} />
              </p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {chain?.name ?? "unknown chain"}
              </p>
            </div>

            {!onPreferred ? (
              <div className="space-y-3">
                <p className="font-mono text-xs text-muted-foreground">
                  Writes on {chainName(catalogChain)} need that network. Public reads still use the catalog chain, not
                  this wallet chain.
                </p>
                <button
                  type="button"
                  disabled={switching}
                  onClick={() => switchChain({ chainId: catalogChain })}
                  className="border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest"
                >
                  Switch to {chainName(catalogChain)}
                </button>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => router.push(returnTo)}
              className="group inline-flex items-center gap-3 border border-accent bg-accent px-6 py-3 font-mono text-xs uppercase tracking-widest text-accent-foreground"
            >
              Continue
              <BitmapChevron className="transition-transform duration-[400ms] ease-in-out group-hover:rotate-45" />
            </button>

            <DisconnectButton className="block border-0 px-0 hover:border-0" />
          </div>
        )}

        <div className="mt-16 flex flex-wrap gap-6">
          <Link href="/markets" className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
            Explore markets
          </Link>
          <Link href="/desk" className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
            Public desk
          </Link>
        </div>
      </div>
    </section>
  );
}
