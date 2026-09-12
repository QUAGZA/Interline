import type { ReactNode } from "react";
import { AppShell } from "@/features/layout/app-shell";

export default function ApplicationLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
