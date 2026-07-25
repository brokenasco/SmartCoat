"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { NumericInput } from "@/components/numeric-input";
import { PaintSelector } from "@/components/paint-selector";
import { calculateMultiRoomEstimate, type RoomEstimateInput } from "@/lib/domain/multi-room-estimate";
import { ESTIMATION_ASSUMPTIONS } from "@/lib/domain/estimation-config";
import type { EstimatePaintSelection } from "@/lib/domain/paint-catalog";
import { parseNumericInput } from "@/lib/domain/numeric-input";
import { formatMoney } from "@/lib/domain/pricing";
import { createClient } from "@/lib/supabase/browser";

type OpeningDraft = { id: string; name: string; kind: "window" | "door" | "other"; width: string; height: string; quantity: string };
type RoomDraft = {
  id: string; name: string; length: string; width: string; height: string;
  workers: string; wageDollars: string; prepHours: string; coats: string;
  coverage: string; waste: string; containerSizeGallons: string;
  containerQuantity: string; pricePerContainerDollars: string;
  openings: OpeningDraft[]; paint: EstimatePaintSelection;
};
type DraftPayload = { rooms: RoomDraft[] };

const emptyPaint = (): EstimatePaintSelection => ({
  paintColorId: null, brandName: null, colorName: null, colorCode: null,
  productName: null, productType: null, projectUse: "interior", sheen: null,
  coverageRate: 400, coverageSource: "company_default", coverageWasOverridden: false,
  coverageOverrideReason: null, containerSizeGallons: 1, containerQuantity: 1,
  pricePerContainerCents: 0, retailerName: null, notes: null, isManualEntry: true,
});
const roomDraft = (position: number, inherit?: RoomDraft): RoomDraft => ({
  id: crypto.randomUUID(), name: `Room ${position}`, length: "", width: "", height: "",
  workers: inherit?.workers ?? "2", wageDollars: inherit?.wageDollars ?? "25.00",
  prepHours: inherit?.prepHours ?? "2", coats: "2", coverage: "400", waste: "10",
  containerSizeGallons: "1", containerQuantity: "1", pricePerContainerDollars: "",
  openings: [], paint: emptyPaint(),
});
const numberValue = (raw: string) => {
  const parsed = parseNumericInput(raw);
  return parsed.state === "valid" ? parsed.value : null;
};

export function EstimateBuilder({ companyId, brands, estimateId: startingId = null, initialTitle = "", initialPayload }: {
  companyId: string;
  brands: { id: string; name: string }[];
  estimateId?: string | null;
  initialTitle?: string;
  initialPayload?: DraftPayload | null;
}) {
  const router = useRouter();
  const [estimateId, setEstimateId] = useState(startingId);
  const [title, setTitle] = useState(initialTitle);
  const [rooms, setRooms] = useState<RoomDraft[]>(initialPayload?.rooms?.length ? initialPayload.rooms : [roomDraft(1)]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [margin, setMargin] = useState("45");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const active = rooms[activeIndex];

  const calculation = useMemo(() => {
    try {
      const targetMargin = numberValue(margin);
      if (targetMargin === null) throw new Error("Enter a valid target gross margin.");
      const inputs: RoomEstimateInput[] = rooms.map(room => {
        const values = {
          lengthFeet: numberValue(room.length), widthFeet: numberValue(room.width), heightFeet: numberValue(room.height),
          crewSize: numberValue(room.workers), wage: numberValue(room.wageDollars), prep: numberValue(room.prepHours),
          coats: numberValue(room.coats), coverage: numberValue(room.coverage), waste: numberValue(room.waste),
          container: numberValue(room.containerSizeGallons), quantity: numberValue(room.containerQuantity), price: numberValue(room.pricePerContainerDollars),
        };
        if (Object.values(values).some(value => value === null)) throw new Error(`${room.name}: complete required measurements, labor, and paint pricing.`);
        if (!room.paint.productName?.trim()) throw new Error(`${room.name}: choose a product line or enter one manually.`);
        if (values.price! <= 0) throw new Error(`${room.name}: enter a verified price per container.`);
        return {
          id: room.id, name: room.name, lengthFeet: values.lengthFeet!, widthFeet: values.widthFeet!,
          heightFeet: values.heightFeet!, openings: room.openings.map(opening => ({
            kind: opening.kind, widthFeet: numberValue(opening.width) ?? 0,
            heightFeet: numberValue(opening.height) ?? 0, quantity: numberValue(opening.quantity) ?? 1,
          })), coats: values.coats!, coverageSqFtPerGallon: values.coverage!, wastePercent: values.waste!,
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
  }, [rooms, margin]);

  function updateRoom(patch: Partial<RoomDraft>) {
    setRooms(current => current.map((room, index) => index === activeIndex ? { ...room, ...patch } : room));
  }
  function updateOpening(id: string, patch: Partial<OpeningDraft>) {
    updateRoom({ openings: active.openings.map(opening => opening.id === id ? { ...opening, ...patch } : opening) });
  }
  function addOpening() {
    updateRoom({ openings: [...active.openings, { id: crypto.randomUUID(), name: `Window ${active.openings.length + 1}`, kind: "window", width: "", height: "", quantity: "1" }] });
  }
  function addRoom() {
    const next = roomDraft(rooms.length + 1, active);
    setRooms(current => [...current, next]);
    setActiveIndex(rooms.length);
  }
  function removeRoom(index: number) {
    if (rooms.length === 1) return setStatus("An estimate must keep at least one room.");
    setRooms(current => current.filter((_, roomIndex) => roomIndex !== index));
    setActiveIndex(current => Math.max(0, Math.min(current, rooms.length - 2)));
  }

  async function saveDraft() {
    if (saving) return;
    setSaving(true); setStatus("Saving draft…");
    const payload = {
      rooms: rooms.map((room, sortOrder) => ({
        ...room, sortOrder, result: calculation.result?.rooms.find(result => result.roomId === room.id) ?? null,
        openings: room.openings.map((opening, openingIndex) => ({ ...opening, sortOrder: openingIndex })),
      })),
    };
    const totals = calculation.result?.totals;
    const supabase = createClient();
    const { data, error } = await supabase.rpc("save_estimate_draft", {
      target_estimate: estimateId, target_company: companyId, draft_title: title,
      payload, calculation: { valid: calculation.valid, error: calculation.error, ...calculation.result },
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

  const numeric = (label: string, key: keyof RoomDraft, suffix?: string, prefix?: string) =>
    <NumericInput label={label} value={String(active[key])} onChange={value => updateRoom({ [key]: value })} suffix={suffix} prefix={prefix}/>;

  return <div className="space-y-6">
    <section className="rounded-xl border border-border bg-surface p-5">
      <label className="block text-sm font-medium">Estimate name<input value={title} onChange={event => setTitle(event.target.value)} placeholder="Untitled draft" className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"/></label>
      <nav aria-label="Estimate rooms" className="mt-5 flex flex-wrap gap-2">{rooms.map((room,index) =>
        <button key={room.id} onClick={() => setActiveIndex(index)} aria-current={index===activeIndex ? "page" : undefined} className={`min-h-11 rounded-lg border px-4 text-sm font-semibold ${index===activeIndex ? "border-brand bg-brand text-white" : "border-border"}`}>{room.name}</button>)}</nav>
    </section>

    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">Room Dimensions</h2><p className="text-sm text-muted">Enter length, width, and wall height to calculate gross wall surface.</p></div><button onClick={() => removeRoom(activeIndex)} className="text-sm font-semibold text-red-700">Remove room</button></div>
      <label className="mt-4 block text-sm font-medium">Room name<input value={active.name} onChange={event => updateRoom({name:event.target.value})} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"/></label>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">{numeric("Length","length","ft")}{numeric("Width","width","ft")}{numeric("Wall Height","height","ft")}</div>
    </section>

    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Windows and Openings</h2><p className="text-sm text-muted">Each opening subtracts from this room’s gross wall area.</p></div><button onClick={addOpening} className="min-h-11 rounded-lg border border-brand px-4 font-semibold text-brand">Add Window</button></div>
      <div className="mt-4 space-y-3">{active.openings.map(opening => <div key={opening.id} className="grid gap-3 rounded-lg bg-background p-3 sm:grid-cols-5">
        <label className="text-sm">Name<input value={opening.name} onChange={e=>updateOpening(opening.id,{name:e.target.value})} className="mt-1 min-h-11 w-full rounded-lg border px-3"/></label>
        <NumericInput label="Width" value={opening.width} suffix="ft" onChange={value=>updateOpening(opening.id,{width:value})}/>
        <NumericInput label="Height" value={opening.height} suffix="ft" onChange={value=>updateOpening(opening.id,{height:value})}/>
        <NumericInput label="Quantity" value={opening.quantity} onChange={value=>updateOpening(opening.id,{quantity:value})}/>
        <button onClick={()=>updateRoom({openings:active.openings.filter(item=>item.id!==opening.id)})} className="self-end min-h-11 text-sm font-semibold text-red-700">Remove</button>
      </div>)}</div>
    </section>

    <section className="rounded-xl border border-border bg-surface p-5"><h2 className="text-xl font-semibold">Labor Setup</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">{numeric("Number of Workers","workers")}{numeric("Average Hourly Wage","wageDollars",undefined,"$")}{numeric("Prep Hours","prepHours","person-hr")}</div>
      <p className="mt-2 text-xs text-muted">Enter the total estimated person-hours required for preparation.</p>
    </section>

    <section className="rounded-xl border border-border bg-surface p-5"><h2 className="text-xl font-semibold">Choose Your Paint</h2>
      <PaintSelector brands={brands} value={active.paint} onChange={paint=>updateRoom({paint})}/>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">{numeric("Number of Coats","coats")}{numeric("Coverage","coverage","ft²/gal")}{numeric("Waste","waste","%")}{numeric("Container Size","containerSizeGallons","gal")}{numeric("Container Quantity","containerQuantity")}{numeric("Price per Container","pricePerContainerDollars",undefined,"$")}</div>
      {calculation.result && <p className="mt-4 rounded-lg bg-background p-4 text-sm">Project total: <strong className="font-mono">{formatMoney(calculation.result.totals.customerEstimateCents)}</strong></p>}
    </section>

    <section className="rounded-xl bg-[#16251d] p-5 text-white">
      <p className="text-sm text-emerald-100/70">Formula {ESTIMATION_ASSUMPTIONS.formulaVersion}. Company production, burden, and overhead assumptions are protected and automatically snapshotted.</p>
      <NumericInput label="Target gross margin" value={margin} suffix="%" onChange={setMargin} className="mt-4 text-white"/>
      {!calculation.valid && <p role="alert" className="mt-3 rounded-lg bg-amber-100 p-3 text-sm text-amber-950">{calculation.error}</p>}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <button onClick={addRoom} className="min-h-12 rounded-lg border border-white/40 font-semibold">Add Room</button>
        <button onClick={saveDraft} disabled={saving} className="min-h-12 rounded-lg bg-white font-semibold text-emerald-950 disabled:opacity-60">{saving ? "Saving…" : "Save as Draft"}</button>
        <button onClick={approve} disabled={!calculation.valid} className="min-h-12 rounded-lg bg-emerald-400 font-semibold text-emerald-950 disabled:opacity-50">Approve Estimate</button>
      </div>
      {status && <p role="status" className="mt-3 text-sm">{status}</p>}
    </section>
  </div>;
}
