"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { dashboardTutorialTransition, trackTutorialEvent, type DashboardTutorialState, type TutorialPlan } from "@/lib/estimate-tutorial";
import { trapDialogFocus } from "@/lib/dialog-focus";

export function DashboardTutorial({ initiallyActive, plan }: { initiallyActive: boolean; plan: TutorialPlan }) {
  const [state, setState] = useState<DashboardTutorialState>(initiallyActive ? "introduction" : "idle");
  const startButton = useRef<HTMLButtonElement>(null);
  const dialogHeading = useRef<HTMLHeadingElement>(null);

  function start() {
    setState(current => dashboardTutorialTransition(current, "start"));
    trackTutorialEvent("tutorial_started", { plan });
  }

  function cancel() {
    setState(current => dashboardTutorialTransition(current, "cancel"));
    trackTutorialEvent("tutorial_exited", { step: "introduction" });
    requestAnimationFrame(() => startButton.current?.focus());
  }

  useEffect(() => {
    if (state === "introduction") dialogHeading.current?.focus();
    if (state !== "new_estimate") return;
    const target = document.querySelector<HTMLElement>('[data-tutorial-id="new-estimate"]');
    target?.setAttribute("data-tutorial-active", "true");
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus();
    return () => target?.removeAttribute("data-tutorial-active");
  }, [state]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && state !== "idle") cancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state]);

  return <>
    <button ref={startButton} type="button" onClick={start} data-tutorial-id="start-tutorial" className="inline-flex min-h-12 items-center rounded-lg border border-border px-5 font-semibold text-brand">Start Tutorial</button>

    {state === "introduction" && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-4 py-8">
      <section role="dialog" aria-modal="true" aria-labelledby="tutorial-introduction-title" onKeyDown={trapDialogFocus} className="w-full max-w-lg rounded-2xl bg-white p-7 shadow-2xl">
        <button aria-label="Cancel tutorial" onClick={cancel} className="float-right rounded-md p-1 text-muted"><X size={18}/></button>
        <p className="text-xs font-bold uppercase tracking-widest text-brand">Step 2 of 17</p>
        <h2 ref={dialogHeading} tabIndex={-1} id="tutorial-introduction-title" className="mt-2 text-3xl font-semibold outline-none">SmartCoat Estimate Tutorial</h2>
        <p className="mt-4 leading-7 text-muted">This walkthrough guides you through a sample painting estimate and shows how SmartCoat calculates pricing in real time.</p>
        <p className="mt-3 rounded-xl bg-amber-50 p-4 text-sm font-medium text-amber-950">The tutorial estimate is temporary, cannot be saved or approved, and will be discarded when you leave.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button onClick={() => { setState(current => dashboardTutorialTransition(current, "begin")); trackTutorialEvent("tutorial_step_completed", { step: "introduction" }); }} className="min-h-11 rounded-lg bg-brand px-4 font-semibold text-white">Begin Tutorial</button>
          <button onClick={cancel} className="min-h-11 px-4 font-semibold text-muted">Cancel</button>
        </div>
      </section>
    </div>}

    {state === "new_estimate" && <aside aria-live="polite" aria-label="Estimate tutorial" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-emerald-200 bg-white p-5 shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6">
      <button aria-label="Exit tutorial" onClick={cancel} className="absolute right-4 top-4 rounded-md p-1 text-muted"><X size={18}/></button>
      <p className="text-xs font-bold uppercase tracking-widest text-brand">Step 3 of 17</p>
      <h2 className="mt-2 text-xl font-semibold">New Estimate</h2>
      <p className="mt-2 text-sm leading-6 text-muted">Select New Estimate to begin building a temporary sample painting estimate.</p>
      <div className="mt-4 flex gap-3">
        <Link href="/dashboard/estimates/new?tutorial=1" onClick={() => trackTutorialEvent("tutorial_step_completed", { step: "new_estimate" })} className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 font-semibold text-white">New Estimate</Link>
        <button onClick={cancel} className="min-h-11 px-3 text-sm font-semibold text-muted">Exit Tutorial</button>
      </div>
    </aside>}
  </>;
}
