import Link from "next/link";
import { redirect } from "next/navigation";
import { EstimateBuilder } from "@/components/estimate-builder";
import { getCompanyEntitlement } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";

export default async function NewEstimate({ searchParams }: { searchParams: Promise<{ tutorial?: string }> }) {
  const tutorialMode = (await searchParams).tutorial === "1";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase.from("company_memberships").select("company_id,role").eq("user_id", user.id).eq("status", "active").limit(1).single();
  if (!membership) redirect("/dashboard");
  const { hasPremiumAccess } = await getCompanyEntitlement(supabase, membership.company_id);
  if (!hasPremiumAccess && !tutorialMode) redirect("/dashboard");
  const { data: settings } = await supabase.from("company_estimate_settings")
    .select("average_hourly_pay_cents,project_overhead_percent")
    .eq("company_id",membership.company_id).maybeSingle();
  return <main className="min-h-screen">
    <header className="border-b border-border bg-surface"><div className="mx-auto max-w-7xl px-5 py-4"><Link href="/dashboard" className="text-sm font-semibold text-brand">← Dashboard</Link></div></header>
    <div className="mx-auto max-w-7xl px-5 py-8"><p className="text-sm text-muted">{tutorialMode ? "Temporary guided estimate · cannot be saved" : "Draft estimate"}</p><h1 className="mb-7 text-3xl font-semibold">Build a room estimate</h1><EstimateBuilder companyId={membership.company_id} initialAverageHourlyPayCents={settings?.average_hourly_pay_cents??2500} initialOverheadPercent={Number(settings?.project_overhead_percent??15)} canManageFinancials={tutorialMode || ["owner","admin","manager"].includes(membership.role)} tutorialMode={tutorialMode}/></div>
  </main>;
}
