"use client";

import Link from "next/link";

export function LandingChrome() {
  return (
    <div className="fixed top-4 right-4 md:top-6 md:right-6 z-[60] flex items-center gap-5">
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
    </div>
  );
}
