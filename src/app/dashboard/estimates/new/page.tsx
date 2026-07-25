import Link from "next/link";
import { redirect } from "next/navigation";
import { EstimateBuilder } from "@/components/estimate-builder";
import { getCompanyEntitlement } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";

export default async function NewEstimate() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase.from("company_memberships").select("company_id,role").eq("user_id", user.id).eq("status", "active").limit(1).single();
  if (!membership) redirect("/dashboard");
  const { hasPremiumAccess } = await getCompanyEntitlement(supabase, membership.company_id);
  if (!hasPremiumAccess) redirect("/dashboard");
  const { data: brands } = await supabase.from("paint_brands").select("id,name").eq("is_active", true).order("name");
  return <main className="min-h-screen">
    <header className="border-b border-border bg-surface"><div className="mx-auto max-w-7xl px-5 py-4"><Link href="/dashboard" className="text-sm font-semibold text-brand">← Dashboard</Link></div></header>
    <div className="mx-auto max-w-7xl px-5 py-8"><p className="text-sm text-muted">Draft estimate</p><h1 className="mb-7 text-3xl font-semibold">Build a room estimate</h1><EstimateBuilder companyId={membership.company_id} brands={brands ?? []} canManageFinancials={["owner","admin","manager"].includes(membership.role)}/></div>
  </main>;
}
