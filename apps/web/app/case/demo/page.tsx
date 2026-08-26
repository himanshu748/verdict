import type { Metadata } from "next";
import { CaseWorkspace } from "@/components/case-workspace";
import { demoCase } from "@/lib/demo-case";

export const metadata: Metadata = {
  title: "TrueForge #417 evidence case",
  description: "Inspect Verdict's simulated reproduction, history range and approval gate for TrueForge issue #417.",
};

export default function DemoCasePage() {
  return <CaseWorkspace data={demoCase} />;
}
