"use client";

import { Suspense, type ReactNode } from "react";
import { AppHeader } from "./app-header";

function HeaderFallback() {
  return <div className="h-14 border-b border-border/40 bg-background" />;
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <Suspense fallback={<HeaderFallback />}>
        <AppHeader />
      </Suspense>
      <div className="grid-bg fixed inset-0 opacity-20" aria-hidden="true" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
