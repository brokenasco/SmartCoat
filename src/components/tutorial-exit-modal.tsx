"use client";

export function TutorialExitModal({ saving, onKeep, onDiscard, onCancel }: {
  saving: boolean;
  onKeep(): void;
  onDiscard(): void;
  onCancel(): void;
}) {
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 px-4">
    <section role="alertdialog" aria-modal="true" aria-labelledby="tutorial-exit-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
      <h2 id="tutorial-exit-title" className="text-2xl font-semibold">Exit the tutorial?</h2>
      <p className="mt-3 leading-7 text-muted">Your sample is temporary. You can keep it as a normal draft or discard it without affecting any real estimate.</p>
      <div className="mt-6 grid gap-3">
        <button disabled={saving} onClick={onKeep} className="min-h-11 rounded-lg bg-brand px-4 font-semibold text-white disabled:opacity-50">Keep as Draft</button>
        <button disabled={saving} onClick={onDiscard} className="min-h-11 rounded-lg border border-red-200 px-4 font-semibold text-red-700 disabled:opacity-50">Discard Tutorial Data</button>
        <button onClick={onCancel} className="min-h-11 text-sm font-semibold text-muted">Continue Tutorial</button>
      </div>
    </section>
  </div>;
}
