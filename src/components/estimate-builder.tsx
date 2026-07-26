"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NumericInput } from "@/components/numeric-input";
import { calculateMultiRoomEstimate, type RoomEstimateInput } from "@/lib/domain/multi-room-estimate";
import { ESTIMATION_ASSUMPTIONS } from "@/lib/domain/estimation-config";
import { parseNumericInput } from "@/lib/domain/numeric-input";
import { formatMoney } from "@/lib/domain/pricing";
import { createClient } from "@/lib/supabase/browser";
import { LEGACY_SURFACE_TYPE, SURFACE_TYPES, type SurfaceTypeKey } from "@/lib/domain/surface-types";

type OpeningKind = "window" | "door" | "archway" | "closet_opening" | "pass_through" | "other";
type OpeningDraft = { id: string; name: string; kind: OpeningKind; width: string; height: string; quantity: string; subtractFromPaintableArea?: boolean };
type RoomDraft = {
  id: string; name: string; length: string; width: string; height: string;
  surfaceType: SurfaceTypeKey | "";
  workers: string; wageDollars: string; prepHours: string; coats: string;
  containerSizeGallons: string;
  containerQuantity: string; pricePerContainerDollars: string;
  openings: OpeningDraft[]; paintBrand: string; paintColorCode: string;
  paint?: { brandName?: string | null; colorCode?: string | null };
};
type DraftPayload = { rooms: RoomDraft[]; targetGrossMarginPercent?: number };

const roomDraft = (position: number, inherit?: RoomDraft): RoomDraft => ({
  id: crypto.randomUUID(), name: `Room ${position}`, length: "", width: "", height: "", surfaceType: "",
  workers: inherit?.workers ?? "2", wageDollars: inherit?.wageDollars ?? "25.00",
  prepHours: inherit?.prepHours ?? "2", coats: "2",
  containerSizeGallons: "1", containerQuantity: "1", pricePerContainerDollars: "",
  openings: [], paintBrand: "", paintColorCode: "",
});
const numberValue = (raw: string) => {
  const parsed = parseNumericInput(raw);
  return parsed.state === "valid" ? parsed.value : null;
};
function calculateDraft(rooms: RoomDraft[], margin: string) {
  try {
    const targetMargin = numberValue(margin);
    if (targetMargin === null) throw new Error("Enter a valid target gross margin.");
    const inputs: RoomEstimateInput[] = rooms.map(room => {
      const values = {
        lengthFeet: numberValue(room.length), widthFeet: numberValue(room.width), heightFeet: numberValue(room.height),
        crewSize: numberValue(room.workers), wage: numberValue(room.wageDollars), prep: numberValue(room.prepHours),
        coats: numberValue(room.coats), container: numberValue(room.containerSizeGallons),
        quantity: numberValue(room.containerQuantity), price: numberValue(room.pricePerContainerDollars),
      };
      if (Object.values(values).some(value => value === null)) throw new Error(`${room.name}: complete required measurements, labor, and paint pricing.`);
      if (!room.surfaceType) throw new Error(`${room.name}: select a surface type.`);
      if (!room.paintBrand.trim()) throw new Error(`${room.name}: enter a paint brand.`);
      if (!room.paintColorCode.trim()) throw new Error(`${room.name}: enter a paint color code.`);
      if (values.price! <= 0) throw new Error(`${room.name}: enter a verified price per container.`);
      return {
        id: room.id, name: room.name, lengthFeet: values.lengthFeet!, widthFeet: values.widthFeet!,
        surfaceType: room.surfaceType, heightFeet: values.heightFeet!,
        openings: room.openings.map(opening => ({
          kind: opening.kind, widthFeet: numberValue(opening.width) ?? 0,
          heightFeet: numberValue(opening.height) ?? 0, quantity: numberValue(opening.quantity) ?? 1,
          subtractFromPaintableArea: opening.subtractFromPaintableArea !== false,
        })),
        coats: values.coats!, wastePercent: ESTIMATION_ASSUMPTIONS.paintWastePercent,
        containerSizeGallons: values.container!, containerQuantity: values.quantity!,
        pricePerContainerCents: Math.round(values.price! * 100), crewSize: values.crewSize!,
        averageWageCentsPerHour: Math.round(values.wage! * 100), prepPersonHours: values.prep!,
        retailer: "manual_supplier" as const, pricingSource: "manual" as const, pricingTimestamp: new Date().toISOString(),
      };
    });
    return { valid: true as const, result: calculateMultiRoomEstimate(inputs, targetMargin), error: "" };
  } catch (error) {
    return { valid: false as const, result: null, error: error instanceof Error ? error.message : "Estimate is incomplete." };
  }
}

export function EstimateBuilder({ companyId, estimateId: startingId = null, initialTitle = "", initialMargin, initialPayload, canManageFinancials = true }: {
  companyId: string;
  estimateId?: string | null;
  initialTitle?: string;
  initialMargin?: number;
  initialPayload?: DraftPayload | null;
  canManageFinancials?: boolean;
}) {
  const router = useRouter();
  const [estimateId, setEstimateId] = useState(startingId);
  const [title, setTitle] = useState(initialTitle);
  const [rooms, setRooms] = useState<RoomDraft[]>(initialPayload?.rooms?.length
    ? initialPayload.rooms.map(room => ({
      ...room,
      surfaceType: room.surfaceType || LEGACY_SURFACE_TYPE,
      paintBrand: room.paintBrand || room.paint?.brandName || "",
      paintColorCode: room.paintColorCode || room.paint?.colorCode || "",
    }))
    : [roomDraft(1)]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [margin, setMargin] = useState(String(initialMargin ?? initialPayload?.targetGrossMarginPercent ?? ESTIMATION_ASSUMPTIONS.defaultGrossMarginPercent));
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [addingRoom, setAddingRoom] = useState(false);
  const roomAddPending = useRef(false);
  const active = rooms[activeIndex];

  const calculation = useMemo(() => calculateDraft(rooms, margin), [rooms, margin]);
  const activeResult = calculation.result?.rooms.find(result => result.roomId === active.id);

  function updateRoom(patch: Partial<RoomDraft>) {
    setRooms(current => current.map((room, index) => index === activeIndex ? { ...room, ...patch } : room));
  }
  function updateOpening(id: string, patch: Partial<OpeningDraft>) {
    updateRoom({ openings: active.openings.map(opening => opening.id === id ? { ...opening, ...patch } : opening) });
  }
  function addOpening() {
    updateRoom({ openings: [...active.openings, { id: crypto.randomUUID(), name: `Opening ${active.openings.length + 1}`, kind: "window", width: "", height: "", quantity: "1", subtractFromPaintableArea: true }] });
  }
  async function addRoom() {
    if (roomAddPending.current || addingRoom || saving) return;
    roomAddPending.current = true;
    setAddingRoom(true);
    const next = roomDraft(rooms.length + 1, active);
    const nextRooms = [...rooms, next];
    setRooms(nextRooms);
    setActiveIndex(nextRooms.length - 1);
    try {
      await saveDraft(nextRooms);
    } finally {
      roomAddPending.current = false;
      setAddingRoom(false);
    }
  }
  async function removeRoom(roomId: string) {
    if (rooms.length === 1) return setStatus("An estimate must keep at least one room.");
    if (!window.confirm("Remove this room?\n\nThis room and its estimate details will be removed.")) return;
    const removedIndex = rooms.findIndex(room => room.id === roomId);
    const nextRooms = rooms.filter(room => room.id !== roomId);
    setRooms(nextRooms);
    setActiveIndex(Math.min(Math.max(removedIndex, 0), nextRooms.length - 1));
    if (estimateId) await saveDraft(nextRooms);
  }

  async function saveDraft(roomsToSave: RoomDraft[] = rooms) {
    if (saving) return;
    setSaving(true); setStatus("Saving draft…");
    const savedCalculation = calculateDraft(roomsToSave, margin);
    const payload = {
      targetGrossMarginPercent: numberValue(margin) ?? ESTIMATION_ASSUMPTIONS.defaultGrossMarginPercent,
      rooms: roomsToSave.map((room, sortOrder) => ({
        ...room,
        paintBrand: room.paintBrand.trim(),
        paintColorCode: room.paintColorCode.trim(),
        paint: { brandName: room.paintBrand.trim(), colorCode: room.paintColorCode.trim() },
        sortOrder, result: (() => {
          const result = savedCalculation.result?.rooms.find(candidate => candidate.roomId === room.id);
          return result ? { ...result, paintBrand: room.paintBrand.trim(), paintColorCode: room.paintColorCode.trim() } : null;
        })(),
        openings: room.openings.map((opening, openingIndex) => ({ ...opening, sortOrder: openingIndex })),
      })),
    };
    const totals = savedCalculation.result?.totals;
    const supabase = createClient();
    const { data, error } = await supabase.rpc("save_estimate_draft", {
      target_estimate: estimateId, target_company: companyId, draft_title: title,
      payload, calculation: { valid: savedCalculation.valid, error: savedCalculation.error, ...savedCalculation.result },
      total_amount: totals?.customerEstimateCents ?? 0, cost_amount: totals?.contractorCostCents ?? 0,
      margin_percent: numberValue(margin) ?? 45,
    });
    setSaving(false);
    if (error) {
      console.error("estimate_draft_save_failed", { code: error.code });
      return setStatus(error.message);
    }
    setEstimateId(data);
    setStatus("Draft saved.");
    router.replace(`/dashboard/estimates/${data}/edit`);
    router.refresh();
    return data as string;
  }

  async function approve() {
    if (!calculation.valid) return setStatus(calculation.error);
    const id = estimateId ?? await saveDraft();
    if (!id) return;
    const confirmed = window.confirm("Approving this estimate will lock dimensions, paint selections, labor assumptions, material costs, and customer price. Future scope changes require a revision or change order.");
    if (!confirmed) return;
    const { error } = await createClient().rpc("approve_estimate", { target_estimate: id });
    if (error) {
      console.error("estimate_approval_failed", { code: error.code });
      return setStatus(error.message);
    }
    router.replace(`/dashboard/estimates/${id}`);
    router.refresh();
  }

  async function deleteDraft() {
    if (!estimateId) return;
    if (!window.confirm(`Delete the draft estimate “${title || "Untitled draft"}”? This removes it from active drafts but retains its audit history.`)) return;
    setSaving(true);
    const { error } = await createClient().rpc("delete_estimate_draft", {
      target_estimate: estimateId,
      deletion_note: "Deleted by manager from estimate editor",
    });
    setSaving(false);
    if (error) {
      console.error("estimate_draft_delete_failed", { code: error.code });
      return setStatus(error.message);
    }
    router.replace("/dashboard/estimates?tab=draft");
    router.refresh();
  }

  const numeric = (label: string, key: keyof RoomDraft, suffix?: string, prefix?: string) =>
    <NumericInput label={label} value={String(active[key])} onChange={value => updateRoom({ [key]: value })} suffix={suffix} prefix={prefix}/>;

  return <div className="space-y-6">
    <section className="rounded-xl border border-border bg-surface p-5">
      <label className="block text-sm font-medium">Estimate name<input value={title} onChange={event => setTitle(event.target.value)} placeholder="Untitled draft" className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"/></label>
      <button type="button" onClick={addRoom} disabled={addingRoom || saving} className="mt-3 min-h-11 rounded-lg border border-brand px-4 font-semibold text-brand disabled:opacity-50">{addingRoom ? "Adding room…" : "Add Room"}</button>
      <nav aria-label="Estimate rooms" className="mt-5 flex flex-wrap gap-2">{rooms.map((room,index) =>
        <button key={room.id} onClick={() => setActiveIndex(index)} aria-current={index===activeIndex ? "page" : undefined} className={`min-h-11 rounded-lg border px-4 text-sm font-semibold ${index===activeIndex ? "border-brand bg-brand text-white" : "border-border"}`}>{room.name}</button>)}</nav>
    </section>

    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">Room Dimensions</h2><p className="text-sm text-muted">Enter length, width, and wall height to calculate gross wall surface.</p></div><button type="button" onClick={() => removeRoom(active.id)} disabled={rooms.length === 1 || saving} title={rooms.length === 1 ? "At least one room is required." : "Remove this room"} className="text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-40">Remove room</button></div>
      <label className="mt-4 block text-sm font-medium">Room name<input value={active.name} onChange={event => updateRoom({name:event.target.value})} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"/></label>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">{numeric("Length","length","ft")}{numeric("Width","width","ft")}{numeric("Wall Height","height","ft")}</div>
      <label className="mt-4 block text-sm font-medium">Surface Type<select required value={active.surfaceType} onChange={event=>updateRoom({surfaceType:event.target.value as SurfaceTypeKey|""})} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-white px-3"><option value="">Select a surface type</option>{SURFACE_TYPES.map(surface=><option key={surface.key} value={surface.key}>{surface.label}</option>)}</select></label>
    </section>

    <section className="rounded-xl border border-border bg-surface p-5">
      <div><h2 className="text-xl font-semibold">Openings</h2><p className="text-sm text-muted">Deduct windows, doors, and other non-paintable areas from gross wall area.</p></div>
      <div className="mt-4 space-y-3">{active.openings.map(opening => <div key={opening.id} className="grid gap-3 rounded-lg bg-background p-3 sm:grid-cols-2 lg:grid-cols-7">
        <label className="text-sm">Opening type<select value={opening.kind} onChange={event=>updateOpening(opening.id,{kind:event.target.value as OpeningKind})} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="window">Window</option><option value="door">Door</option><option value="archway">Archway</option><option value="closet_opening">Closet Opening</option><option value="pass_through">Pass-Through</option><option value="other">Other</option></select></label>
        <label className="text-sm">Name<input value={opening.name} onChange={e=>updateOpening(opening.id,{name:e.target.value})} className="mt-1 min-h-11 w-full rounded-lg border px-3"/></label>
        <NumericInput label="Width" value={opening.width} suffix="ft" onChange={value=>updateOpening(opening.id,{width:value})}/>
        <NumericInput label="Height" value={opening.height} suffix="ft" onChange={value=>updateOpening(opening.id,{height:value})}/>
        <NumericInput label="Quantity" value={opening.quantity} onChange={value=>updateOpening(opening.id,{quantity:value})}/>
        <label className="flex min-h-11 items-center gap-2 self-end text-sm"><input type="checkbox" checked={opening.subtractFromPaintableArea !== false} onChange={event=>updateOpening(opening.id,{subtractFromPaintableArea:event.target.checked})}/>Subtract from Paintable Area</label>
        <p className="self-end pb-3 text-sm">Area: <strong>{((numberValue(opening.width)??0)*(numberValue(opening.height)??0)*(numberValue(opening.quantity)??0)).toFixed(1)} ft²</strong></p>
        <button onClick={()=>updateRoom({openings:active.openings.filter(item=>item.id!==opening.id)})} className="self-end min-h-11 text-sm font-semibold text-red-700">Remove Opening</button>
      </div>)}</div>
      <button type="button" onClick={addOpening} className="mt-4 min-h-11 rounded-lg border border-brand px-4 font-semibold text-brand">Add Opening</button>
    </section>

    <section className="rounded-xl border border-border bg-surface p-5"><h2 className="text-xl font-semibold">Labor Setup</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">{numeric("Number of Workers","workers")}{numeric("Average Hourly Wage","wageDollars",undefined,"$")}{numeric("Prep Hours","prepHours","person-hr")}</div>
      <p className="mt-2 text-xs text-muted">Enter the total estimated person-hours required for preparation.</p>
    </section>

    <section className="rounded-xl border border-border bg-surface p-5"><h2 className="text-xl font-semibold">Choose Your Paint</h2>
      <p className="mt-1 text-sm text-muted">Record the manufacturer and color identifier used for this room.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Paint Brand<input required value={active.paintBrand} onChange={event=>updateRoom({paintBrand:event.target.value})} placeholder="e.g. Sherwin-Williams" className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"/></label>
        <label className="text-sm font-medium">Paint Color Code<input required value={active.paintColorCode} onChange={event=>updateRoom({paintColorCode:event.target.value})} placeholder="e.g. SW 7005" className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"/></label>
      </div>
    </section>

    <section className="rounded-xl border border-border bg-surface p-5"><h2 className="text-xl font-semibold">Paint Materials</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">{numeric("Number of Coats","coats")}{numeric("Container Size","containerSizeGallons","gal")}{numeric("Container Quantity","containerQuantity")}{numeric("Price per Container","pricePerContainerDollars",undefined,"$")}</div>
      {canManageFinancials && activeResult && <dl className="mt-4 grid gap-3 rounded-lg bg-background p-4 sm:grid-cols-3">
        <div><dt className="text-xs text-muted">Base Coverage Rate</dt><dd className="font-mono">{ESTIMATION_ASSUMPTIONS.baseCoverageRateSqFtPerGallon} ft²/gal</dd></div>
        <div><dt className="text-xs text-muted">Surface Type</dt><dd className="font-medium">{activeResult.surfaceLabel}</dd></div>
        <div><dt className="text-xs text-muted">Surface Modifier</dt><dd className="font-mono">{activeResult.surfaceModifier.toFixed(2)}</dd></div>
        <div><dt className="text-xs text-muted">Effective Coverage Rate</dt><dd className="font-mono">{activeResult.effectiveCoverageRateSqFtPerGallon.toFixed(2)} ft²/gal</dd></div>
        <div><dt className="text-xs text-muted">Raw Gallons Required</dt><dd className="font-mono">{activeResult.rawGallonsRequired.toFixed(3)} gal</dd></div>
        <div><dt className="text-xs text-muted">Purchased Paint</dt><dd className="font-mono">{activeResult.purchaseQuantity} × {activeResult.containerSizeGallons} gal</dd></div>
      </dl>}
      {calculation.result && <p className="mt-4 rounded-lg bg-background p-4 text-sm">Project total: <strong className="font-mono">{formatMoney(calculation.result.totals.customerEstimateCents)}</strong></p>}
    </section>

    <section className="rounded-xl bg-[#16251d] p-5 text-white">
      <p className="text-sm text-emerald-100/70">Formula {ESTIMATION_ASSUMPTIONS.formulaVersion}. Company production, burden, and overhead assumptions are protected and automatically snapshotted.</p>
      {canManageFinancials && <label className="mt-4 block font-medium" htmlFor="target-margin">Target Gross Margin <strong className="float-right">{margin}%</strong><input id="target-margin" aria-valuetext={`${margin} percent target gross margin`} type="range" min="0" max={ESTIMATION_ASSUMPTIONS.maximumGrossMarginPercent} step="1" value={margin} onChange={event=>setMargin(event.target.value)} className="mt-4 w-full accent-emerald-400"/></label>}
      {canManageFinancials && calculation.result && <dl className="mt-5 grid gap-3 rounded-lg bg-white/5 p-4 sm:grid-cols-3">
        <div><dt className="text-xs text-emerald-100/70">Gross wall area</dt><dd className="font-mono">{calculation.result.totals.grossWallAreaSqFt.toFixed(1)} ft²</dd></div>
        <div><dt className="text-xs text-emerald-100/70">Opening area</dt><dd className="font-mono">{calculation.result.totals.openingAreaSqFt.toFixed(1)} ft²</dd></div>
        <div><dt className="text-xs text-emerald-100/70">Net paintable area</dt><dd className="font-mono">{calculation.result.totals.netPaintableAreaSqFt.toFixed(1)} ft²</dd></div>
        <div><dt className="text-xs text-emerald-100/70">Raw gallons required</dt><dd className="font-mono">{calculation.result.totals.rawGallonsRequired.toFixed(3)}</dd></div>
        <div><dt className="text-xs text-emerald-100/70">Internal cost</dt><dd className="font-mono">{formatMoney(calculation.result.totals.contractorCostCents)}</dd></div>
        <div><dt className="text-xs text-emerald-100/70">Final customer estimate</dt><dd className="font-mono">{formatMoney(calculation.result.totals.customerEstimateCents)}</dd></div>
        <div><dt className="text-xs text-emerald-100/70">Expected gross profit</dt><dd className="font-mono">{formatMoney(calculation.result.totals.expectedGrossProfitCents)}</dd></div>
      </dl>}
      {!calculation.valid && <p role="alert" className="mt-3 rounded-lg bg-amber-100 p-3 text-sm text-amber-950">{calculation.error}</p>}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button onClick={() => saveDraft()} disabled={saving} className="min-h-12 rounded-lg bg-white font-semibold text-emerald-950 disabled:opacity-60">{saving ? "Saving…" : "Save as Draft"}</button>
        {canManageFinancials && <button onClick={approve} disabled={!calculation.valid} className="min-h-12 rounded-lg bg-emerald-400 font-semibold text-emerald-950 disabled:opacity-50">Approve Estimate</button>}
      </div>
      {canManageFinancials && estimateId && <button type="button" onClick={deleteDraft} disabled={saving} className="mt-5 min-h-11 text-sm font-semibold text-red-300 underline-offset-4 hover:underline disabled:opacity-50">Delete Draft</button>}
      {status && <p role="status" className="mt-3 text-sm">{status}</p>}
    </section>
  </div>;
}
