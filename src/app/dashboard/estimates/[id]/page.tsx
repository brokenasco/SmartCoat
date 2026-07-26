import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/domain/pricing";
import { ProgressEditor, type ApprovedRoomProgress } from "@/components/progress-editor";

type SnapshotRoom = {
  name: string;
  length: string;
  width: string;
  height: string;
  coats?: string;
  surfaceType?: string;
  paintBrand?: string;
  paintColorCode?: string;
  paint?: { brandName?: string; colorCode?: string; colorName?: string; productName?: string };
  result?: { netPaintableAreaSqFt?: number };
};

export default async function ApprovedEstimate({params}:{params:Promise<{id:string}>}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase.from("company_memberships").select("company_id,role").eq("user_id",user.id).eq("status","active").limit(1).single();
  if (!membership) redirect("/dashboard");
  const [{data:estimate},{data:snapshot},{data:progress},{data:databaseRooms}] = await Promise.all([
    supabase.from("estimates").select("id,title,status,estimate_number,total_cents,approved_at,formula_version").eq("id",id).eq("company_id",membership.company_id).is("deleted_at",null).single(),
    supabase.from("estimate_approval_snapshots").select("snapshot,snapshot_hash").eq("estimate_id",id).maybeSingle(),
    supabase.from("estimate_progress").select("progress_notes").eq("estimate_id",id).maybeSingle(),
    supabase.from("estimate_rooms").select("id,name,sort_order,room_progress(is_completed,completed_at)").eq("estimate_id",id).eq("company_id",membership.company_id).order("sort_order"),
  ]);
  if (!estimate) notFound();
  if (estimate.status === "draft") redirect(`/dashboard/estimates/${id}/edit`);
  const approved = snapshot?.snapshot as { rooms?: SnapshotRoom[] } | undefined;
  const snapshotRooms = approved?.rooms ?? [];
  const rooms: ApprovedRoomProgress[] = (databaseRooms ?? []).map((databaseRoom,index) => {
    const room = snapshotRooms[index] ?? { name: databaseRoom.name, length: "", width: "", height: "" };
    const roomProgress = Array.isArray(databaseRoom.room_progress) ? databaseRoom.room_progress[0] : databaseRoom.room_progress;
    return {
      roomId: databaseRoom.id,
      name: room.name || databaseRoom.name,
      details: `${room.length} × ${room.width} × ${room.height} ft · ${room.result?.netPaintableAreaSqFt??0} ft² net`,
      paint: `${room.paintBrand || room.paint?.brandName || "Paint brand not recorded"} · ${room.paintColorCode || room.paint?.colorCode || "Color not recorded"}`,
      surface: (room.surfaceType || "legacy surface").replaceAll("_"," "),
      coats: room.coats || "—",
      isCompleted: roomProgress?.is_completed ?? false,
      completedAt: roomProgress?.completed_at ?? null,
    };
  });
  const canUpdate = ["owner","admin","manager","estimator"].includes(membership.role);
  return <main className="min-h-screen">
    <header className="border-b bg-surface print:hidden"><div className="mx-auto max-w-5xl px-5 py-4"><Link href="/dashboard/estimates?tab=approved" className="font-semibold text-brand">← Approved</Link></div></header>
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-8">
      <section className="rounded-xl bg-[#16251d] p-6 text-white"><p className="text-xs uppercase text-emerald-100/70">Approved Estimate #{estimate.estimate_number}</p><h1 className="mt-2 text-3xl font-semibold">{estimate.title}</h1><p className="mt-4 font-mono text-3xl">{formatMoney(estimate.total_cents)}</p><p className="mt-2 text-sm text-emerald-100/70">Formula {estimate.formula_version} · Locked {estimate.approved_at?new Date(estimate.approved_at).toLocaleString():""}</p></section>
      <ProgressEditor estimateId={id} initialRooms={rooms} initialNotes={progress?.progress_notes??""} canUpdate={canUpdate}/>
      <section className="rounded-xl border bg-surface p-5"><h2 className="text-xl font-semibold">Locked Scope and Pricing</h2><p className="mt-1 text-sm text-muted">Measurements, labor assumptions, paint, overhead, margin, and pricing remain preserved in the approval snapshot.</p><p className="mt-4 break-all text-xs text-muted">Snapshot integrity: {snapshot?.snapshot_hash}</p></section>
      <p className="print:hidden text-sm text-muted">Use your browser’s Print command to print or save this immutable approved estimate as PDF.</p>
    </div>
  </main>;
}
