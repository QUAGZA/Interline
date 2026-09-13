"use client";

import { useState } from "react";
import Link from "next/link";
import { FocusDialog } from "@/components/focus-dialog";

export function LandingChrome() {
  const [about, setAbout] = useState(false);
  return (
    <div className="fixed top-4 right-4 md:top-6 md:right-6 z-[60] flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-end gap-3 md:gap-5">
      <button
        type="button"
        onClick={() => setAbout(true)}
        className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors duration-200"
      >
        About this page
      </button>
      <Link
        href="/markets"
        className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors duration-200"
      >
        Markets
      </Link>
      <Link
        href="/dashboard"
        className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors duration-200"
      >
        Dashboard
      </Link>
      {about ? (
        <FocusDialog title="About this page" onClose={() => setAbout(false)} className="fixed top-16 right-4 md:right-6 w-80 border border-border bg-card p-4 space-y-3">
          <p className="font-mono text-sm">About this page</p>
          <p className="font-mono text-xs text-muted-foreground">
            Isolated lending markets. Browse without connecting. Press Escape or Close to dismiss.
          </p>
          <button type="button" className="border border-border px-3 py-2 font-mono text-[10px] uppercase" onClick={() => setAbout(false)}>
            Close
          </button>
        </FocusDialog>
      ) : null}
    </div>
  );
}
