import type { SupabaseClient } from "@supabase/supabase-js";

const ACCESS_STATUSES = new Set(["active", "trialing", "lifetime"]);
export type Entitlement = { status: string; access_expires_at: string | null; source: string };

export async function getCompanyEntitlement(supabase: SupabaseClient, companyId: string) {
  const { data } = await supabase.from("company_entitlements").select("status,access_expires_at,source").eq("company_id", companyId).maybeSingle<Entitlement>();
  const unexpired = !data?.access_expires_at || new Date(data.access_expires_at).getTime() > Date.now();
  return { entitlement: data, hasPremiumAccess: Boolean(data && ACCESS_STATUSES.has(data.status) && unexpired) };
}
