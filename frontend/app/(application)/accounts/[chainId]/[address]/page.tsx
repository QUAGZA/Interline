import type { Metadata } from "next";
import { WatchAccount } from "@/features/portfolio/watch-account";
import { parseAddressParam, parseRouteChainId } from "@/lib/chains";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ chainId: string; address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  return { title: `Account ${address.slice(0, 8)} — Interline` };
}

export default async function AccountPage({
  params,
}: {
  params: Promise<{ chainId: string; address: string }>;
}) {
  const raw = await params;
  const chainId = parseRouteChainId(raw.chainId);
  const address = parseAddressParam(raw.address);
  if (!chainId || !address) {
    return (
      <section className="px-6 py-10">
        <h1 className="font-[var(--font-bebas)] text-4xl">INVALID ACCOUNT</h1>
      </section>
    );
  }
  return <WatchAccount chainId={chainId} address={address} />;
}
