import dynamic from "next/dynamic";
import { HeroSection } from "@/components/hero-section";
import { LandingChrome } from "@/components/landing-chrome";
import { SideNav } from "@/components/side-nav";
import { SmoothScroll } from "@/components/smooth-scroll";

const SignalsSection = dynamic(
  () => import("@/components/signals-section").then((m) => m.SignalsSection),
);
const WorkSection = dynamic(() => import("@/components/work-section").then((m) => m.WorkSection));
const PrinciplesSection = dynamic(
  () => import("@/components/principles-section").then((m) => m.PrinciplesSection),
);
const ColophonSection = dynamic(
  () => import("@/components/colophon-section").then((m) => m.ColophonSection),
);

export default function Home() {
  return (
    <SmoothScroll>
      <main className="relative min-h-screen">
        <LandingChrome />
        <SideNav />
        <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />

        <div className="relative z-10">
          <HeroSection />
          <SignalsSection />
          <WorkSection />
          <PrinciplesSection />
          <ColophonSection />
        </div>
      </main>
    </SmoothScroll>
  );
}
