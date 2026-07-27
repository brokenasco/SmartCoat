import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleDollarSign, ClipboardList, Plus, Users } from "lucide-react";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/domain/pricing";
import { getCompanyEntitlement } from "@/lib/entitlements";
import { PremiumGate } from "@/components/premium-gate";
import { DashboardTutorial } from "@/components/dashboard-tutorial";
import { tutorialPlanFromStatus } from "@/lib/estimate-tutorial";
import { AccountMenu } from "@/components/account-menu";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ tutorial?: string }> }) {
  const tutorialActive = (await searchParams).tutorial === "1";
  if (!hasSupabaseEnv()) return <Setup/>;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase.from("company_memberships").select("company_id, role, companies(name)").eq("user_id", user.id).eq("status", "active").limit(1).single();
  if (!membership) redirect("/login?error=onboarding");
  const { entitlement, hasPremiumAccess } = await getCompanyEntitlement(supabase, membership.company_id);
  const { data: estimates } = await supabase.from("estimates").select("id,title,status,total_cents,created_at").eq("company_id", membership.company_id).is("deleted_at",null).order("created_at", { ascending: false }).limit(8);
  const pipeline = (estimates ?? []).reduce((sum, estimate) => sum + estimate.total_cents, 0);
  const company = Array.isArray(membership.companies) ? membership.companies[0] : membership.companies;
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const userName = profile?.full_name?.trim() || user.email?.split("@")[0] || "Account";
  return <main className="min-h-screen">
    <div data-tutorial-id="dashboard-main" aria-hidden={!hasPremiumAccess && !tutorialActive} inert={!hasPremiumAccess && !tutorialActive ? true : undefined} className={!hasPremiumAccess && !tutorialActive ? "pointer-events-none select-none" : undefined}>
    <header className="border-b border-border bg-surface"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4"><Link href="/dashboard" className="text-xl font-bold"><span className="text-brand">Smart</span>Coat</Link><div className="flex items-center gap-3 sm:gap-5"><Link href="/settings/product-tour" className="hidden text-sm font-semibold text-brand sm:block">Product tour</Link><AccountMenu userName={userName} companyName={company?.name ?? "Company"} role={membership.role}/></div></div></header>
    <div className="mx-auto max-w-7xl px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-muted">Operations overview</p><h1 className="text-3xl font-semibold tracking-tight">Good work starts with a clear number.</h1></div><div className="flex flex-wrap gap-3"><Link href="/dashboard?tutorial=1" className="inline-flex min-h-12 items-center rounded-lg border border-border px-5 font-semibold text-brand">Start Tutorial</Link><Link href="/dashboard/estimates" className="inline-flex min-h-12 items-center rounded-lg border border-brand px-5 font-semibold text-brand">Drafts & Approved</Link><Link data-tutorial-id="new-estimate-button" href={tutorialActive ? "/dashboard/estimates/new?tutorial=1" : "/dashboard/estimates/new"} className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-brand px-5 font-semibold text-white"><Plus size={18}/>New estimate</Link></div></div>
      <section className="mt-8 grid gap-4 sm:grid-cols-3"><Metric icon={ClipboardList} label="Recent estimates" value={String(estimates?.length ?? 0)}/><Metric icon={CircleDollarSign} label="Estimate pipeline" value={formatMoney(pipeline)}/><Metric icon={Users} label="Current role" value={membership.role.replaceAll("_", " ")}/></section>
      <section className="mt-8 rounded-xl border border-border bg-surface"><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">Recent estimates</h2></div>{!estimates?.length ? <div className="p-10 text-center"><p className="font-medium">No estimates yet</p><p className="mt-1 text-sm text-muted">Create a measured, margin-protected estimate to start the pipeline.</p></div> : <div className="divide-y divide-border">{estimates.map(estimate => <div key={estimate.id} className="flex items-center justify-between gap-4 px-5 py-4"><div><p className="font-medium">{estimate.title}</p><p className="text-xs uppercase text-muted">{estimate.status}</p></div><p className="font-mono font-semibold">{formatMoney(estimate.total_cents)}</p></div>)}</div>}</section>
    </div>
    </div>
    {!hasPremiumAccess && !tutorialActive && <PremiumGate/>}
    <DashboardTutorial active={tutorialActive} plan={tutorialPlanFromStatus(entitlement?.status)}/>
  </main>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof ClipboardList; label: string; value: string }) {
  return <article className="rounded-xl border border-border bg-surface p-5"><Icon size={20} className="text-brand"/><p className="mt-5 text-sm text-muted">{label}</p><p className="mt-1 text-2xl font-semibold capitalize">{value}</p></article>;
}

function Setup() {
  return <main className="grid min-h-screen place-items-center p-6"><div className="max-w-lg rounded-xl border border-border bg-surface p-8"><p className="text-sm font-semibold text-brand">SmartCoat</p><h1 className="mt-2 text-2xl font-semibold">Service temporarily unavailable</h1><p className="mt-3 leading-7 text-muted">We could not load your workspace. Please try again shortly.</p><Link href="/" className="mt-6 inline-block font-semibold text-brand">Return home</Link></div></main>;
}
