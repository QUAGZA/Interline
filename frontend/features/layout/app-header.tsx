"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAccount, useSwitchChain } from "wagmi";
import { V2_CHAINS, chainName, parseRouteChainId, viewingChainFromPath, type V2ChainId } from "@/lib/chains";
import { defaultV2ChainId } from "@/lib/config";
import { useAppPrefs } from "@/features/settings/prefs";
import { cn } from "@/lib/utils";
import { WalletStrip } from "@/components/ui/wallet-strip";
import { ConnectButton, DisconnectButton } from "@/components/connect-button";
import { EnsLabel } from "@/components/ens-label";

const NAV = [
  { href: "/markets", label: "Markets", match: (p: string) => p.startsWith("/markets") },
  { href: "/direct", label: "Direct lending", match: (p: string) => p.startsWith("/direct") },
  { href: "/desk", label: "Public desk", match: (p: string) => p === "/desk" || p.startsWith("/positions") },
  { href: "/dashboard", label: "Dashboard", match: (p: string) => p.startsWith("/dashboard") },
];

export function AppHeader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { prefs, update } = useAppPrefs();
  const viewing = viewingChainFromPath(pathname, searchParams, prefs.defaultChainId ?? defaultV2ChainId);

  const { address, isConnected, chainId: walletChainId } = useAccount();
  const { switchChain, isPending: switching } = useSwitchChain();

  const walletMismatch = isConnected && walletChainId !== viewing;

  function setViewChain(id: V2ChainId) {
    update({ defaultChainId: id });
    const parts = pathname.split("/").filter(Boolean);
    if (parts[0] === "direct") {
      if (parts[1] === "legacy" && parts[2] && parseRouteChainId(parts[2])) {
        router.push(["", "direct", "legacy", String(id), ...parts.slice(3)].join("/"));
        return;
      }
      if (parts[1] && parseRouteChainId(parts[1])) {
        router.push(["", "direct", String(id), ...parts.slice(2)].join("/"));
        return;
      }
    }
    if (
      (parts[0] === "markets" || parts[0] === "positions" || parts[0] === "accounts") &&
      parts[1] &&
      parseRouteChainId(parts[1])
    ) {
      const next = ["", parts[0], String(id), ...parts.slice(2)].join("/");
      router.push(next);
      return;
    }
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("chainId", String(id));
    const q = sp.toString();
    router.push(`${pathname}${q ? `?${q}` : ""}`);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 md:px-6">
        <Link href="/" className="font-[var(--font-bebas)] text-xl tracking-wide text-foreground hover:text-accent">
          INTERLINE
        </Link>
        <nav className="hidden md:flex items-center gap-5 ml-6" aria-label="Application">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "font-mono text-[11px] uppercase tracking-widest",
                item.match(pathname) ? "text-accent" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <details className="md:hidden ml-auto">
          <summary
            id="mobile-nav-toggle"
            className="cursor-pointer list-none border border-border px-3 py-1 font-mono text-[10px] uppercase tracking-widest [&::-webkit-details-marker]:hidden"
          >
            Menu
          </summary>
          <div
            id="mobile-menu"
            className="fixed left-0 right-0 top-14 z-50 space-y-3 border-t border-border/40 bg-background px-4 py-3"
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block font-mono text-xs uppercase tracking-widest text-foreground"
              >
                {item.label}
              </Link>
            ))}
            <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Network
              <select
                className="border border-border bg-background px-2 py-1 text-foreground"
                value={viewing}
                onChange={(e) => setViewChain(Number(e.target.value) as V2ChainId)}
              >
                {V2_CHAINS.map((c) => (
                  <option key={c.chainId} value={c.chainId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {isConnected ? (
              <div className="space-y-2">
                <WalletStrip chainId={viewing} />
                <p className="font-mono text-xs">
                  <EnsLabel address={address} />
                </p>
                <DisconnectButton />
              </div>
            ) : (
              <ConnectButton className="block w-full" />
            )}
          </div>
        </details>
        <div className="ml-auto hidden md:flex items-center gap-3">
          <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Network
            <select
              className="border border-border bg-background px-2 py-1 text-foreground"
              value={viewing}
              onChange={(e) => setViewChain(Number(e.target.value) as V2ChainId)}
            >
              {V2_CHAINS.map((c) => (
                <option key={c.chainId} value={c.chainId}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {walletMismatch ? (
            <button
              type="button"
              disabled={switching}
              onClick={() => switchChain({ chainId: viewing })}
              className="border border-destructive px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-destructive"
            >
              Switch wallet to {chainName(viewing)}
            </button>
          ) : null}
          {isConnected ? (
            <div className="flex items-center gap-3">
              <WalletStrip chainId={viewing} />
              <Link
                href="/dashboard"
                className="font-mono text-xs text-foreground hover:text-accent"
                title={address}
              >
                <EnsLabel address={address} />
              </Link>
              <DisconnectButton />
            </div>
          ) : (
            <ConnectButton />
          )}
        </div>
      </div>
    </header>
  );
}
