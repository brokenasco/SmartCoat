"use client";
import { trapDialogFocus } from "@/lib/dialog-focus";

export function TutorialCompletionModal({ onFinish, onRestart }: {
  onFinish(): void;
  onRestart(): void;
}) {
  return <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-slate-950/45 px-4 py-8">
    <section role="dialog" aria-modal="true" aria-labelledby="tutorial-complete-title" onKeyDown={trapDialogFocus} className="w-full max-w-lg rounded-2xl bg-white p-7 shadow-2xl">
      <p className="text-xs font-bold uppercase tracking-widest text-brand">Step 17 of 17</p>
      <h2 id="tutorial-complete-title" tabIndex={-1} autoFocus className="mt-2 text-3xl font-semibold outline-none">Tutorial Complete</h2>
      <p className="mt-4 leading-7 text-muted">You have completed the SmartCoat estimate walkthrough. This temporary tutorial estimate has not been saved and will now be discarded.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button onClick={onFinish} className="min-h-12 rounded-lg bg-brand px-4 font-semibold text-white">Finish Tutorial</button>
        <button onClick={onRestart} className="min-h-12 rounded-lg border border-border px-4 font-semibold">Restart Tutorial</button>
      </div>
    </section>
  </div>;
}
