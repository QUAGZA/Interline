"use client";

import { PageHeader } from "@/components/ui/chrome";
import { useAppPrefs } from "./prefs";
import { V2_CHAINS, type V2ChainId } from "@/lib/chains";

export function SettingsForm() {
  const { prefs, update } = useAppPrefs();
  return (
    <section className="px-4 md:px-6 py-10 max-w-xl mx-auto space-y-6">
      <PageHeader
        kicker="Dashboard / Settings"
        title="SETTINGS"
        description="This browser only."
      />
      <label className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Default catalog chain
        <select
          className="mt-2 w-full border border-border bg-background px-2 py-2 text-foreground"
          value={prefs.defaultChainId}
          onChange={(e) => update({ defaultChainId: Number(e.target.value) as V2ChainId })}
        >
          {V2_CHAINS.map((c) => (
            <option key={c.chainId} value={c.chainId}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <p className="font-mono text-[11px] text-muted-foreground">
        Public market and desk reads still use the chain id in the URL or deployment catalog, not the connected wallet.
      </p>
    </section>
  );
}
