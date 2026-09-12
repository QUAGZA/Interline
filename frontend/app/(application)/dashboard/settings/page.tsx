import type { Metadata } from "next";
import { SettingsForm } from "@/features/settings/settings-form";

export const metadata: Metadata = {
  title: "Settings — Interline",
};

export default function SettingsPage() {
  return <SettingsForm />;
}
