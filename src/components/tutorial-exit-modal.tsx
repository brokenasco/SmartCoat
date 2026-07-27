"use client";
import { trapDialogFocus } from "@/lib/dialog-focus";

export function TutorialExitModal({ onDiscard, onCancel }: {
  onDiscard(): void;
  onCancel(): void;
}) {
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 px-4">
    <section role="alertdialog" aria-modal="true" aria-labelledby="tutorial-exit-title" onKeyDown={trapDialogFocus} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
      <h2 id="tutorial-exit-title" tabIndex={-1} autoFocus className="text-2xl font-semibold outline-none">Exit the tutorial?</h2>
      <p className="mt-3 leading-7 text-muted">Your tutorial estimate is temporary and will be discarded. No draft or approved estimate will be created.</p>
      <div className="mt-6 grid gap-3">
        <button onClick={onCancel} className="min-h-11 text-sm font-semibold text-muted">Continue Tutorial</button>
        <button onClick={onDiscard} className="min-h-11 rounded-lg border border-red-200 px-4 font-semibold text-red-700">Exit and Discard</button>
      </div>
    </section>
  </div>;
}
