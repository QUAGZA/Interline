"use client";

import { useRef, useEffect } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

gsap.registerPlugin(ScrollTrigger);

export function ColophonSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced || !sectionRef.current) return;

    const ctx = gsap.context(() => {
      if (headerRef.current) {
        gsap.from(headerRef.current, {
          x: -60,
          opacity: 0,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: headerRef.current,
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        });
      }

      if (gridRef.current) {
        const columns = gridRef.current.querySelectorAll(":scope > div");
        gsap.from(columns, {
          y: 40,
          opacity: 0,
          duration: 0.8,
          stagger: 0.1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: gridRef.current,
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        });
      }

      if (footerRef.current) {
        gsap.from(footerRef.current, {
          y: 20,
          opacity: 0,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: footerRef.current,
            start: "top 95%",
            toggleActions: "play none none reverse",
          },
        });
      }
    }, sectionRef);

    return () => ctx.revert();
  }, [reduced]);

  return (
    <section
      ref={sectionRef}
      id="colophon"
      className="relative py-32 pl-6 md:pl-28 pr-6 md:pr-12 border-t border-border/30"
    >
      <div ref={headerRef} className="mb-16">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">04 / Colophon</span>
        <h2 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">STACK</h2>
      </div>

      <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-8 md:gap-12">
        <div className="col-span-1">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Contracts</h4>
          <ul className="space-y-2">
            <li className="font-mono text-xs text-foreground/80">Foundry</li>
            <li className="font-mono text-xs text-foreground/80">Solidity 0.8.24</li>
            <li className="font-mono text-xs text-foreground/80">OpenZeppelin v5</li>
          </ul>
        </div>

        <div className="col-span-1">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Desk</h4>
          <ul className="space-y-2">
            <li className="font-mono text-xs text-foreground/80">Next.js</li>
            <li className="font-mono text-xs text-foreground/80">wagmi / viem</li>
            <li className="font-mono text-xs text-foreground/80">Tailwind CSS</li>
          </ul>
        </div>

        <div className="col-span-1">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Typography</h4>
          <ul className="space-y-2">
            <li className="font-mono text-xs text-foreground/80">Bebas Neue</li>
            <li className="font-mono text-xs text-foreground/80">IBM Plex Sans</li>
            <li className="font-mono text-xs text-foreground/80">IBM Plex Mono</li>
          </ul>
        </div>

        <div className="col-span-1">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Scope</h4>
          <ul className="space-y-2">
            <li className="font-mono text-xs text-foreground/80">Local Anvil</li>
            <li className="font-mono text-xs text-foreground/80">Testnet demo</li>
            <li className="font-mono text-xs text-foreground/80">Not mainnet</li>
          </ul>
        </div>

        <div className="col-span-1">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Source</h4>
          <ul className="space-y-2">
            <li>
              <Link
                href="/markets"
                className="font-mono text-xs text-foreground/80 hover:text-accent transition-colors duration-200"
              >
                Markets
              </Link>
            </li>
            <li>
              <a
                href="https://github.com/QUAGZA/Interline"
                className="font-mono text-xs text-foreground/80 hover:text-accent transition-colors duration-200"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
            </li>
            <li className="font-mono text-xs text-foreground/80">QUAGZA/Interline</li>
          </ul>
        </div>

        <div className="col-span-1">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Year</h4>
          <ul className="space-y-2">
            <li className="font-mono text-xs text-foreground/80">2026</li>
            <li className="font-mono text-xs text-foreground/80">v2</li>
          </ul>
        </div>
      </div>

      <div
        ref={footerRef}
        className="mt-24 pt-8 border-t border-border/20 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
      >
        <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
          © 2026 Interline. Isolated markets. Test assets. Simulated prices / testnet.
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">
          Restricted borrows never reach an EOA. Wallet-mode borrows do.
        </p>
      </div>
    </section>
  );
}
