"use client";

import { type ReactNode } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { BitmapChevron } from "@/components/bitmap-chevron";
import { cn } from "@/lib/utils";

const headerBtn =
  "border border-accent bg-accent px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-accent-foreground disabled:opacity-50";
const ghostBtn =
  "border border-foreground/20 px-2 py-1 font-mono text-[10px] uppercase tracking-widest hover:border-accent hover:text-accent disabled:opacity-50";
const panelBtn =
  "group flex w-full items-center justify-between border border-foreground/20 px-6 py-4 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent disabled:opacity-50";

export function ConnectButton({
  className,
  variant = "header",
  label = "Connect",
}: {
  className?: string;
  variant?: "header" | "panel" | "inline";
  label?: string;
}) {
  const classes = variant === "panel" ? panelBtn : headerBtn;
  const inner =
    variant === "panel" ? (
      <>
        <span>{label}</span>
        <BitmapChevron className="transition-transform duration-[400ms] ease-in-out group-hover:rotate-45" />
      </>
    ) : (
      label
    );
  return <InjectedLoginButton className={cn(classes, className)}>{inner}</InjectedLoginButton>;
}

export function DisconnectButton({ className }: { className?: string }) {
  return <InjectedLogoutButton className={cn(ghostBtn, className)} />;
}

function InjectedLoginButton({ className, children }: { className?: string; children: ReactNode }) {
  const { connect, connectors, isPending, error } = useConnect();
  const { isConnected } = useAccount();
  if (isConnected) return null;
  const connector = connectors.find((c) => c.id === "injected") ?? connectors[0];
  if (!connector) return null;
  return (
    <>
      <button type="button" disabled={isPending} onClick={() => connect({ connector })} className={className}>
        {children}
      </button>
      {error ? <p className="font-mono text-xs text-destructive">{error.message}</p> : null}
    </>
  );
}

function InjectedLogoutButton({ className }: { className?: string }) {
  const { disconnect } = useDisconnect();
  const { isConnected } = useAccount();
  if (!isConnected) return null;
  return (
    <button type="button" onClick={() => disconnect()} className={className}>
      Disconnect
    </button>
  );
}
