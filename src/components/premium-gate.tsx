"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { LockKeyhole, Sparkles } from "lucide-react";

export function PremiumGate() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-slate-950/28 px-4 py-8 backdrop-blur-[2px]">
    <section role="dialog" aria-modal="true" aria-labelledby="premium-title" className="w-full max-w-lg rounded-2xl border border-white/70 bg-white p-7 shadow-2xl sm:p-9">
      <div className="inline-flex rounded-xl bg-emerald-100 p-3 text-brand"><LockKeyhole/></div>
      <p className="mt-5 text-xs font-bold uppercase tracking-[.18em] text-brand">Premium access</p>
      <h1 ref={heading} tabIndex={-1} id="premium-title" className="mt-2 text-3xl font-semibold tracking-tight outline-none">Your workspace is ready to unlock.</h1>
      <p className="mt-4 leading-7 text-muted">Preview your SmartCoat dashboard, then subscribe to create and save real customer estimates—or learn the workflow safely with a temporary sample.</p>
      <div className="mt-7 grid gap-3">
        <Link href="/subscribe" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brand px-5 font-semibold text-white">Subscribe to SmartCoat Premium</Link>
        <Link href="/dashboard?tutorial=1" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-white px-5 font-semibold text-brand"><Sparkles size={18}/>Take a Guided Tour</Link>
      </div>
      <p className="mt-5 text-center text-xs text-muted">The tour never creates customer, project, or financial records unless you explicitly keep it.</p>
    </section>
  </div>;
}
