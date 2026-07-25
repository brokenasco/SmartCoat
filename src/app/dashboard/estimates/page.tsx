import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/domain/pricing";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;

export default async function EstimatesPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; page?: string }> }) {
  const params = await searchParams;
  const tab = params.tab === "approved" ? "approved" : "draft";
  const page = Math.max(1, Number(params.page) || 1);
  const q = (params.q ?? "").trim().slice(0, 100);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase.from("company_memberships").select("company_id").eq("user_id",user.id).eq("status","active").limit(1).single();
  if (!membership) redirect("/dashboard");
  const counts = await Promise.all([
    supabase.from("estimates").select("id",{count:"exact",head:true}).eq("company_id",membership.company_id).eq("status","draft"),
    supabase.from("estimates").select("id",{count:"exact",head:true}).eq("company_id",membership.company_id).eq("status","approved"),
  ]);
  let query = supabase.from("estimates")
    .select("id,estimate_number,title,status,total_cents,created_at,updated_at,approved_at,draft_payload,properties(address_line_1,city,postal_code),customers(name)",{count:"exact"})
    .eq("company_id",membership.company_id).eq("status",tab)
    .order(tab==="draft" ? "updated_at" : "approved_at",{ascending:false})
    .range((page-1)*PAGE_SIZE,page*PAGE_SIZE-1);
  if (q) query=query.or(`title.ilike.%${q.replaceAll(",","")}%,estimate_number.eq.${Number(q)||0}`);
  const { data: estimates, count } = await query;
  return <main className="min-h-screen">
    <header className="border-b border-border bg-surface"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4"><Link href="/dashboard" className="font-semibold text-brand">← Dashboard</Link><Link href="/dashboard/estimates/new" className="rounded-lg bg-brand px-4 py-3 font-semibold text-white">New estimate</Link></div></header>
    <div className="mx-auto max-w-7xl px-5 py-8">
      <h1 className="text-3xl font-semibold">Estimates</h1>
      <nav className="mt-6 flex gap-2" aria-label="Estimate status"><Tab href="/dashboard/estimates?tab=draft" active={tab==="draft"}>Drafts ({counts[0].count??0})</Tab><Tab href="/dashboard/estimates?tab=approved" active={tab==="approved"}>Approved ({counts[1].count??0})</Tab></nav>
      <form className="mt-5 flex gap-2"><input type="hidden" name="tab" value={tab}/><label className="sr-only" htmlFor="estimate-search">Search estimates</label><input id="estimate-search" name="q" defaultValue={q} placeholder="Search name or estimate number" className="min-h-11 flex-1 rounded-lg border border-border px-3"/><button className="rounded-lg border border-brand px-4 font-semibold text-brand">Search</button></form>
      {!estimates?.length ? <section className="mt-6 rounded-xl border border-border bg-surface p-10 text-center"><h2 className="font-semibold">{tab==="draft" ? "You do not have any draft estimates." : "No estimates have been approved yet."}</h2><p className="mt-2 text-sm text-muted">{tab==="draft" ? "Start a new estimate to begin building a project quote." : "Completed drafts will appear here after approval."}</p></section> :
      <section className="mt-6 divide-y divide-border rounded-xl border border-border bg-surface">{estimates.map(estimate=>{
        const payload=estimate.draft_payload as {rooms?:unknown[]}|null; const customer=Array.isArray(estimate.customers)?estimate.customers[0]:estimate.customers; const property=Array.isArray(estimate.properties)?estimate.properties[0]:estimate.properties;
        return <article key={estimate.id} className="grid gap-4 p-5 md:grid-cols-[1fr_auto]"><div><p className="text-xs uppercase text-muted">Estimate #{estimate.estimate_number} · {estimate.status}</p><h2 className="mt-1 text-lg font-semibold">{estimate.title}</h2><p className="text-sm text-muted">{customer?.name??"No customer selected"}{property?` · ${property.address_line_1}, ${property.city} ${property.postal_code}`:""}</p><p className="mt-2 text-xs text-muted">{payload?.rooms?.length??0} rooms · Updated {new Date(estimate.updated_at).toLocaleString()}</p></div><div className="flex items-center gap-4"><strong className="font-mono">{formatMoney(estimate.total_cents)}</strong><Link href={tab==="draft"?`/dashboard/estimates/${estimate.id}/edit`:`/dashboard/estimates/${estimate.id}`} className="rounded-lg bg-brand px-4 py-3 font-semibold text-white">{tab==="draft"?"Open and Edit":"View Approved"}</Link></div></article>;
      })}</section>}
      {(count??0)>PAGE_SIZE && <nav className="mt-5 flex justify-between"><Link aria-disabled={page===1} href={`?tab=${tab}&q=${encodeURIComponent(q)}&page=${Math.max(1,page-1)}`}>Previous</Link><span>Page {page}</span><Link href={`?tab=${tab}&q=${encodeURIComponent(q)}&page=${page+1}`}>Next</Link></nav>}
    </div>
  </main>;
}
function Tab({href,active,children}:{href:string;active:boolean;children:React.ReactNode}){return <Link href={href} aria-current={active?"page":undefined} className={`rounded-lg px-4 py-3 font-semibold ${active?"bg-brand text-white":"border border-border bg-surface"}`}>{children}</Link>}
