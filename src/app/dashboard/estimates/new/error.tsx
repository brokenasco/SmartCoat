"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function NewEstimateError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[estimate-builder] unexpected route error", {
      name: error.name,
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return <main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-5">
    <section className="w-full rounded-xl border border-border bg-surface p-8 text-center">
      <h1 className="text-2xl font-semibold">The estimate could not be displayed</h1>
      <p className="mt-3 text-muted">Your saved information was not deleted. Retry the estimate, or return to the dashboard.</p>
      <div className="mt-6 flex justify-center gap-3">
        <button onClick={reset} className="min-h-11 rounded-lg bg-brand px-5 font-semibold text-white">Try again</button>
        <Link href="/dashboard" className="flex min-h-11 items-center rounded-lg border border-border px-5 font-semibold">Dashboard</Link>
      </div>
    </section>
  </main>;
}
