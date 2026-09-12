"use client";

import { useCallback, useEffect, useState } from "react";
import { defaultV2ChainId } from "@/lib/config";
import { isV2ChainId, type V2ChainId } from "@/lib/chains";

const KEY = "interline.v2.prefs";

export type AppPrefs = {
  defaultChainId: V2ChainId;
};

function readPrefs(): AppPrefs {
  if (typeof window === "undefined") return { defaultChainId: defaultV2ChainId };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { defaultChainId: defaultV2ChainId };
    const parsed = JSON.parse(raw) as { defaultChainId?: number };
    const chain = parsed.defaultChainId;
    return { defaultChainId: chain !== undefined && isV2ChainId(chain) ? chain : defaultV2ChainId };
  } catch {
    return { defaultChainId: defaultV2ChainId };
  }
}

export function useAppPrefs() {
  const [prefs, setPrefs] = useState<AppPrefs>({ defaultChainId: defaultV2ChainId });
  useEffect(() => {
    setPrefs(readPrefs());
  }, []);
  const update = useCallback((next: Partial<AppPrefs>) => {
    setPrefs((cur) => {
      const merged = { ...cur, ...next };
      window.localStorage.setItem(KEY, JSON.stringify(merged));
      return merged;
    });
  }, []);
  return { prefs, update };
}
