import Link from "next/link";
import { ArrowRight, Calculator, ChartNoAxesCombined, ShieldCheck } from "lucide-react";

export default function Home() {
  const foundation = [
    [Calculator, "Explainable estimating", "Every surface, coat, production rate, and cost remains visible."],
    [ShieldCheck, "Tenant-first security", "Company isolation is enforced in PostgreSQL RLS and server authorization."],
    [ChartNoAxesCombined, "Profit control", "Integer-cent calculations keep margin, markup, tax, and deposits precise."],
  ] as const;
  return <main>
    <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6"><Link href="/" className="text-xl font-bold tracking-tight"><span className="text-brand">Smart</span>Coat</Link><Link href="/login" className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold hover:border-brand">Sign in</Link></nav>
    <section className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[1.15fr_.85fr] lg:py-28">
      <div><p className="mb-5 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-brand-dark">Built for painting contractors</p><h1 className="max-w-3xl text-5xl font-semibold leading-[1.05] tracking-[-.045em] sm:text-6xl">Smarter estimates.<br/><span className="text-brand">Better profits.</span></h1><p className="mt-7 max-w-xl text-lg leading-8 text-muted">Turn measurements into transparent labor, material, and margin calculations—then carry approved work from proposal through production and payment.</p><div className="mt-9 flex flex-wrap gap-3"><Link href="/login?mode=signup" className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-dark">Start your company <ArrowRight size={18}/></Link><Link href="/tour" className="inline-flex min-h-12 items-center rounded-lg border border-border bg-surface px-5 py-3 font-semibold">Take the product tour</Link></div></div>
      <div className="rounded-2xl border border-border bg-[#16251d] p-7 text-white shadow-2xl shadow-emerald-950/15"><div className="flex items-center justify-between"><span className="text-sm text-emerald-200">Estimate health</span><span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs text-emerald-200">Margin protected</span></div><p className="mt-10 text-4xl font-semibold">45.0%</p><p className="mt-1 text-sm text-emerald-100/70">Target gross margin</p><div className="mt-8 grid grid-cols-2 gap-3"><div className="rounded-xl bg-white/7 p-4"><p className="text-xs text-emerald-100/60">Labor</p><p className="mt-2 font-mono text-xl">$10,000</p></div><div className="rounded-xl bg-white/7 p-4"><p className="text-xs text-emerald-100/60">Materials</p><p className="mt-2 font-mono text-xl">$2,500</p></div></div><div className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-4"><p className="text-xs text-emerald-100/70">Customer total incl. tax</p><p className="mt-1 font-mono text-3xl">$26,500</p></div></div>
    </section>
    <section id="foundation" className="border-y border-border bg-surface"><div className="mx-auto grid max-w-6xl gap-8 px-6 py-16 md:grid-cols-3">{foundation.map(([Icon,title,copy])=><article key={title}><Icon className="text-brand"/><h2 className="mt-4 text-lg font-semibold">{title}</h2><p className="mt-2 leading-7 text-muted">{copy}</p></article>)}</div></section>
  </main>;
}
