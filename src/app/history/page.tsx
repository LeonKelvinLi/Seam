import type { Metadata } from "next";
import { GenerationHistory } from "@/components/GenerationHistory";

export const metadata: Metadata = { title: "Previous generations — Clipmelt", robots: { index: false, follow: false } };

export default function HistoryPage() {
  return <GenerationHistory />;
}
