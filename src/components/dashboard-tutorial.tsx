"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { trackTutorialEvent, type TutorialPlan } from "@/lib/estimate-tutorial";

export function DashboardTutorial({ active, plan }: { active: boolean; plan: TutorialPlan }) {
  const [step, setStep] = useState<"intro" | "new">("intro");
  const [open, setOpen] = useState(active);

  useEffect(() => {
    if (active) trackTutorialEvent("tutorial_started", { plan });
  }, [active, plan]);

  const target = step === "intro" ? "dashboard-main" : "new-estimate-button";
  useEffect(() => {
    if (!open) return;
    const targetElement = document.querySelector<HTMLElement>(`[data-tutorial-id="${target}"]`);
    targetElement?.setAttribute("data-tutorial-active", "true");
    targetElement?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (step === "new") targetElement?.focus();
    return () => targetElement?.removeAttribute("data-tutorial-active");
  }, [open, step, target]);

  if (!open) return null;

  return <aside aria-live="polite" aria-label="Estimate tutorial" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-emerald-200 bg-white p-5 shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6">
    <button aria-label="Exit tutorial" onClick={() => { setOpen(false); trackTutorialEvent("tutorial_exited", { step }); }} className="absolute right-4 top-4 rounded-md p-1 text-muted"><X size={18}/></button>
    <p className="text-xs font-bold uppercase tracking-widest text-brand">Step {step === "intro" ? 1 : 2} of 16</p>
    <h2 className="mt-2 text-xl font-semibold">{step === "intro" ? "Welcome to SmartCoat" : "Create your sample estimate"}</h2>
    <p className="mt-2 text-sm leading-6 text-muted">{step === "intro"
      ? "This tutorial uses the real dashboard and estimate builder to create a complete painting estimate."
      : "Select New Estimate. The tutorial will wait for you and will keep all sample data temporary."}</p>
    <div className="mt-4 flex gap-3">
      {step === "intro"
        ? <button onClick={() => { setStep("new"); trackTutorialEvent("tutorial_step_completed", { step: "dashboard_intro" }); }} className="min-h-11 rounded-lg bg-brand px-4 font-semibold text-white">Show me</button>
        : <Link data-tutorial-id="tutorial-new-estimate-link" href="/dashboard/estimates/new?tutorial=1" onClick={() => trackTutorialEvent("tutorial_step_completed", { step: "click_new_estimate" })} className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 font-semibold text-white">New Estimate</Link>}
      <button onClick={() => { setOpen(false); trackTutorialEvent("tutorial_skipped", { step }); }} className="min-h-11 px-3 text-sm font-semibold text-muted">Skip Tutorial</button>
    </div>
  </aside>;
}
