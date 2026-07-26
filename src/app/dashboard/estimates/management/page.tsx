import Link from "next/link";
import { redirect } from "next/navigation";
import { EstimateNavigation } from "@/components/estimate-navigation";
import { ManagementSettingsForm } from "@/components/management-settings-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ManagementPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase.from("company_memberships").select("company_id,role")
    .eq("user_id",user.id).eq("status","active").limit(1).single();
  if (!membership) redirect("/dashboard");
  const canManage = ["owner","admin","manager"].includes(membership.role);
  if (!canManage) redirect("/dashboard/estimates");
  const { data: settings } = await supabase.from("company_estimate_settings")
    .select("average_hourly_pay_cents,project_overhead_percent")
    .eq("company_id",membership.company_id).single();
  return <main className="min-h-screen">
    <header className="border-b border-border bg-surface"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4"><Link href="/dashboard" className="font-semibold text-brand">← Dashboard</Link><Link href="/dashboard/estimates/new" className="rounded-lg bg-brand px-4 py-3 font-semibold text-white">New estimate</Link></div></header>
    <div className="mx-auto max-w-7xl px-5 py-8">
      <h1 className="text-3xl font-semibold">Estimates</h1>
      <EstimateNavigation active="management" canManage/>
      <ManagementSettingsForm companyId={membership.company_id} initialAverageHourlyPayCents={settings?.average_hourly_pay_cents??2500} initialOverheadPercent={Number(settings?.project_overhead_percent??15)}/>
    </div>
  </main>;
}
