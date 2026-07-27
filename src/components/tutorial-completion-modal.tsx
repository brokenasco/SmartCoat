"use client";
import { trapDialogFocus } from "@/lib/dialog-focus";
import { isPaidTutorialPlan, type TutorialPlan } from "@/lib/estimate-tutorial";

export function TutorialCompletionModal({ plan, onFinish, onRestart }: {
  plan: TutorialPlan;
  onFinish(): void;
  onRestart(): void;
}) {
  const paid = isPaidTutorialPlan(plan);
  return <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-slate-950/45 px-4 py-8">
    <section role="dialog" aria-modal="true" aria-labelledby="tutorial-complete-title" onKeyDown={trapDialogFocus} className="w-full max-w-lg rounded-2xl bg-white p-7 shadow-2xl">
      <p className="text-xs font-bold uppercase tracking-widest text-brand">Step 17 of 17</p>
      <h2 id="tutorial-complete-title" tabIndex={-1} autoFocus className="mt-2 text-3xl font-semibold outline-none">Tutorial Complete</h2>
      <p className="mt-4 leading-7 text-muted">You completed the SmartCoat estimate walkthrough. This temporary estimate was not saved.</p>
      <div className="mt-5 rounded-xl bg-emerald-50 p-5">
        <h3 className="font-semibold text-emerald-950">{paid ? "Your Premium Management Features" : "Unlock More with SmartCoat Premium"}</h3>
        <p className="mt-2 text-sm leading-6 text-emerald-950/75">Premium gives managers company-wide control while keeping every new estimate consistent.</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-emerald-950/80">
          <li>Set the company’s average hourly pay</li>
          <li>Customize the default project overhead percentage</li>
          <li>Apply company estimating defaults to every new estimate</li>
          <li>Save drafts and approve final customer estimates</li>
          <li>Track approved projects and room completion progress</li>
          <li>Access expanded Management controls</li>
        </ul>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button onClick={onFinish} className="min-h-12 rounded-lg bg-brand px-4 font-semibold text-white">Exit Tutorial</button>
        <button onClick={onRestart} className="min-h-12 rounded-lg border border-border px-4 font-semibold">Restart Tutorial</button>
      </div>
    </section>
  </div>;
}
