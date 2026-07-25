import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function PaintCatalogAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: isAdmin } = await supabase.rpc("current_user_is_platform_administrator");
  if (!isAdmin) redirect("/dashboard");
  const [{ data: sources }, { data: jobs }] = await Promise.all([
    supabase.from("paint_data_sources").select("id,source_name,authorization_status,is_enabled,last_successful_sync_at").order("source_name"),
    supabase.from("paint_import_jobs").select("id,status,records_received,records_rejected,created_at").order("created_at", { ascending: false }).limit(20),
  ]);
  return <main className="mx-auto min-h-screen max-w-6xl px-5 py-8">
    <Link href="/dashboard" className="text-sm font-semibold text-brand">← Dashboard</Link>
    <h1 className="mt-5 text-3xl font-semibold">Paint catalog administration</h1>
    <p className="mt-2 text-muted">Only sources with documented authorization may be enabled. Files are validated and staged before any catalog upsert.</p>
    <section className="mt-8 rounded-xl border border-border bg-surface p-5">
      <h2 className="font-semibold">Source registry</h2>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border"><th className="py-2">Source</th><th>Status</th><th>Enabled</th><th>Last successful sync</th></tr></thead><tbody>{sources?.map(source=><tr key={source.id} className="border-b border-border/60"><td className="py-3">{source.source_name}</td><td className="font-mono text-xs">{source.authorization_status}</td><td>{source.is_enabled?"Yes":"No"}</td><td>{source.last_successful_sync_at??"Never"}</td></tr>)}</tbody></table></div>
    </section>
    <section className="mt-6 rounded-xl border border-border bg-surface p-5">
      <h2 className="font-semibold">Approved manual imports</h2>
      <p className="mt-2 text-sm text-muted">Parser version 1.0.0 accepts approved CSV/JSON/XML/XLSX/palette adapters. Import artifacts must be stored privately; database error rows retain references rather than full payloads.</p>
      <p className="mt-3 rounded-lg bg-background p-3 text-sm">No upload is enabled until a source record is changed from <code>pending_permission</code> to <code>approved_manual_import</code> with a license reference.</p>
    </section>
    <section className="mt-6 rounded-xl border border-border bg-surface p-5">
      <h2 className="font-semibold">Recent jobs</h2>
      <p className="mt-2 text-sm text-muted">{jobs?.length ? `${jobs.length} jobs shown.` : "No import jobs have run."}</p>
    </section>
  </main>;
}
