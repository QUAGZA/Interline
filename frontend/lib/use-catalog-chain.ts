"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useAppPrefs } from "@/features/settings/prefs";
import { defaultV2ChainId } from "@/lib/config";
import { viewingChainFromPath, type V2ChainId } from "@/lib/chains";

/** Header / query / prefs catalog chain. Independent of the connected wallet. */
export function useCatalogChainId(): V2ChainId {
  const pathname = usePathname();
  const search = useSearchParams();
  const { prefs } = useAppPrefs();
  return viewingChainFromPath(pathname, search, prefs.defaultChainId ?? defaultV2ChainId);
}
