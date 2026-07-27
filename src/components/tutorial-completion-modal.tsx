"use client";

import Link from "next/link";
import { isPaidTutorialPlan, trackTutorialEvent, type TutorialPlan } from "@/lib/estimate-tutorial";

export function TutorialCompletionModal({ plan, action, saving, onKeep, onDiscard }: {
  plan: TutorialPlan;
  action: "draft" | "approve";
  saving: boolean;
  onKeep(): void;
  onDiscard(): void;
}) {
  const paid = isPaidTutorialPlan(plan);
  return <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-slate-950/45 px-4 py-8">
    <section role="dialog" aria-modal="true" aria-labelledby="tutorial-complete-title" className="w-full max-w-xl rounded-2xl bg-white p-7 shadow-2xl">
      <p className="text-xs font-bold uppercase tracking-widest text-brand">Tutorial complete</p>
      <h2 id="tutorial-complete-title" className="mt-2 text-3xl font-semibold">{paid ? "Explore Management Features" : plan === "trial" ? "Premium controls are active during your trial" : "Customize SmartCoat with Premium"}</h2>
      <p className="mt-4 leading-7 text-muted">{paid
        ? "Managers can customize company-wide average hourly pay and project overhead while keeping every new estimate consistent."
        : "Premium gives managers more control over how estimates are calculated and managed. Customize company-wide settings such as average hourly pay and project overhead."}</p>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted">
        <li>Change the default project overhead percentage</li>
        <li>Set the company average hourly pay</li>
        <li>Apply consistent company defaults to new estimates</li>
        <li>Access expanded management controls</li>
      </ul>
      <div className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">
        This is tutorial data. Keep it as a real {action === "approve" ? "approved estimate" : "draft"}, or remove it safely.
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button disabled={saving} onClick={onKeep} className="min-h-12 rounded-lg bg-brand px-4 font-semibold text-white disabled:opacity-50">Keep Estimate</button>
        <button disabled={saving} onClick={onDiscard} className="min-h-12 rounded-lg border border-border px-4 font-semibold disabled:opacity-50">Remove Tutorial Estimate</button>
      </div>
      <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold">
        {paid || plan === "trial"
          ? <Link href="/dashboard/estimates/management" onClick={() => trackTutorialEvent("premium_cta_clicked", { plan })} className="text-brand">Explore Management Features</Link>
          : <Link href="/subscribe" onClick={() => trackTutorialEvent("premium_cta_clicked", { plan })} className="text-brand">Explore Premium</Link>}
        <button onClick={onDiscard} className="text-muted">Maybe Later</button>
      </div>
    </section>
  </div>;
}
