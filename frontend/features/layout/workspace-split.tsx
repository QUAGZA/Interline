"use client";

import type { ReactNode } from "react";

export function WorkspaceSplit({ main, rail }: { main: ReactNode; rail: ReactNode }) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="order-2 min-w-0 space-y-4 lg:order-1">{main}</div>
      <aside className="order-1 min-w-0 space-y-3 lg:sticky lg:top-16 lg:order-2">{rail}</aside>
    </div>
  );
}
