"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NumericInput } from "@/components/numeric-input";
import { EstimateSummary } from "@/components/estimate-summary";
import { calculateMultiRoomEstimate, type RoomEstimateInput } from "@/lib/domain/multi-room-estimate";
import { ESTIMATION_ASSUMPTIONS } from "@/lib/domain/estimation-config";
import { parseNumericInput } from "@/lib/domain/numeric-input";
import { sharedLaborFromFirstRoom, synchronizeRoomLabor, updateSharedLabor, type SharedLaborFields } from "@/lib/domain/shared-labor";
import { createClient } from "@/lib/supabase/browser";
import { LEGACY_SURFACE_TYPE, SURFACE_TYPES, type SurfaceTypeKey } from "@/lib/domain/surface-types";
import { EstimateTutorialCoach } from "@/components/estimate-tutorial-coach";
import { TutorialCompletionModal } from "@/components/tutorial-completion-modal";
import { TutorialExitModal } from "@/components/tutorial-exit-modal";
import { ESTIMATE_TUTORIAL_STEPS, ESTIMATE_TUTORIAL_VERSION, PREP_HOURS_LABEL, TUTORIAL_SAMPLE, canPersistEstimate, trackTutorialEvent, type EstimateTutorialStep, type EstimateMode } from "@/lib/estimate-tutorial";

type OpeningKind = "window" | "door" | "archway" | "closet_opening" | "pass_through" | "other";
type OpeningDraft = { id: string; name: string; kind: OpeningKind; width: string; height: string; quantity: string; subtractFromPaintableArea?: boolean };
type RoomDraft = {
  id: string; name: string; length: string; width: string; height: string;
  surfaceType: SurfaceTypeKey | "";
  workers: string; wageDollars: string; prepHours: string; coats: string;
  containerSizeGallons: string;
  pricePerContainerDollars: string;
  openings: OpeningDraft[]; paintBrand: string; paintColorCode: string;
  paint?: { brandName?: string | null; colorCode?: string | null };
};
type DraftPayload = { rooms: RoomDraft[]; targetGrossMarginPercent?: number };

const roomDraft = (position: number, inherit?: RoomDraft, defaultWageDollars = "25.00"): RoomDraft => ({
  id: crypto.randomUUID(), name: `Room ${position}`, length: "", width: "", height: "", surfaceType: "",
  workers: inherit?.workers ?? "2", wageDollars: inherit?.wageDollars ?? defaultWageDollars,
  prepHours: inherit?.prepHours ?? "2", coats: "2",
  containerSizeGallons: "1", pricePerContainerDollars: "",
  openings: [], paintBrand: "", paintColorCode: "",
});
const numberValue = (raw: string) => {
  const parsed = parseNumericInput(raw);
  return parsed.state === "valid" ? parsed.value : null;
};
function calculateDraft(rooms: RoomDraft[], margin: string, overheadPercent: number) {
  try {
    const targetMargin = numberValue(margin);
    if (targetMargin === null) throw new Error("Enter a valid target gross margin.");
    const inputs: RoomEstimateInput[] = rooms.map(room => {
      const values = {
        lengthFeet: numberValue(room.length), widthFeet: numberValue(room.width), heightFeet: numberValue(room.height),
        crewSize: numberValue(room.workers), wage: numberValue(room.wageDollars), prep: numberValue(room.prepHours),
        coats: numberValue(room.coats), container: numberValue(room.containerSizeGallons),
        price: numberValue(room.pricePerContainerDollars),
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
        containerSizeGallons: values.container!,
        pricePerContainerCents: Math.round(values.price! * 100), crewSize: values.crewSize!,
        averageWageCentsPerHour: Math.round(values.wage! * 100), prepPersonHours: values.prep!,
        retailer: "manual_supplier" as const, pricingSource: "manual" as const, pricingTimestamp: new Date().toISOString(),
      };
    });
    return { valid: true as const, result: calculateMultiRoomEstimate(inputs, targetMargin, overheadPercent), error: "" };
  } catch (error) {
    return { valid: false as const, result: null, error: error instanceof Error ? error.message : "Estimate is incomplete." };
  }
}

export function friendlyEstimateError(error: { code?: string; message?: string }, operation: "draft" | "approval") {
  const message = error.message?.toLowerCase() ?? "";
  if (error.code === "PGRST301" || message.includes("jwt") || message.includes("session")) {
    return "Your session has expired. Sign in again to continue.";
  }
  if (
    message === "not authorized"
    || message.includes("manager permission required")
    || message.includes("row-level security")
  ) {
    return "You do not have permission to update this estimate.";
  }
  if (error.code === "PGRST116" || message.includes("not found")) return "This estimate could not be found.";
  if (error.code === "23503" || error.code === "23505" || error.code === "23514") {
    return operation === "draft"
      ? "Complete the required estimate information before saving."
      : "This estimate cannot be approved until all required information is complete.";
  }
  if (message.includes("active draft") || message.includes("locked") || message.includes("updated elsewhere")) {
    return "This estimate was updated elsewhere. Refresh the page and try again.";
  }
  if (operation === "approval" && (
    message.includes("required") || message.includes("valid") || message.includes("incomplete")
    || message.includes("stale")
  )) {
    return "This estimate cannot be approved until all required information is complete.";
  }
  return operation === "draft"
    ? "We could not save this estimate as a draft. Please try again."
    : "We could not approve this estimate. Please try again.";
}

export function EstimateBuilder({ companyId, estimateId: startingId = null, initialTitle = "", initialMargin, initialPayload, initialAverageHourlyPayCents = 2500, initialOverheadPercent = ESTIMATION_ASSUMPTIONS.overheadPercent, canManageFinancials = true, tutorialMode = false }: {
  companyId: string;
  estimateId?: string | null;
  initialTitle?: string;
  initialMargin?: number;
  initialPayload?: DraftPayload | null;
  initialAverageHourlyPayCents?: number;
  initialOverheadPercent?: number;
  canManageFinancials?: boolean;
  tutorialMode?: boolean;
}) {
  const router = useRouter();
  const estimateMode: EstimateMode = tutorialMode ? "tutorial" : startingId ? "edit" : "create";
  const [estimateId, setEstimateId] = useState(startingId);
  const [title, setTitle] = useState(initialTitle);
  const [rooms, setRooms] = useState<RoomDraft[]>(() => synchronizeRoomLabor(initialPayload?.rooms?.length
    ? initialPayload.rooms.map(room => ({
      ...room,
      surfaceType: room.surfaceType || LEGACY_SURFACE_TYPE,
      paintBrand: room.paintBrand || room.paint?.brandName || "",
      paintColorCode: room.paintColorCode || room.paint?.colorCode || "",
    }))
    : [roomDraft(1, undefined, (initialAverageHourlyPayCents / 100).toFixed(2))]));
  const [activeIndex, setActiveIndex] = useState(0);
  const [margin, setMargin] = useState(String(initialMargin ?? initialPayload?.targetGrossMarginPercent ?? ESTIMATION_ASSUMPTIONS.defaultGrossMarginPercent));
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [addingRoom, setAddingRoom] = useState(false);
  const roomAddPending = useRef(false);
  const [tutorialStep, setTutorialStep] = useState<EstimateTutorialStep>("estimate_name");
  const [tutorialError, setTutorialError] = useState("");
  const [tutorialCompleteOpen, setTutorialCompleteOpen] = useState(false);
  const [tutorialExitOpen, setTutorialExitOpen] = useState(false);
  const active = rooms[activeIndex];

  const calculation = useMemo(() => calculateDraft(rooms, margin, initialOverheadPercent), [rooms, margin, initialOverheadPercent]);
  const activeResult = calculation.result?.rooms.find(result => result.roomId === active.id);

  function tutorialStepComplete(step: EstimateTutorialStep) {
    trackTutorialEvent("tutorial_step_completed", { step });
    const index = ESTIMATE_TUTORIAL_STEPS.indexOf(step);
    if (index < ESTIMATE_TUTORIAL_STEPS.length - 1) setTutorialStep(ESTIMATE_TUTORIAL_STEPS[index + 1]);
    setTutorialError("");
  }

  function updateRoom(patch: Partial<RoomDraft>) {
    setRooms(current => current.map((room, index) => index === activeIndex ? { ...room, ...patch } : room));
  }
  function updateLabor(patch: Partial<SharedLaborFields>) {
    setRooms(current => updateSharedLabor(current, patch));
  }
  function updateOpening(id: string, patch: Partial<OpeningDraft>) {
    updateRoom({ openings: active.openings.map(opening => opening.id === id ? { ...opening, ...patch } : opening) });
  }
  function fillTutorialExample() {
    if (tutorialStep === "estimate_name") setTitle(TUTORIAL_SAMPLE.estimateName);
    else if (tutorialStep === "number_of_workers") updateLabor({ workers: TUTORIAL_SAMPLE.labor.workers });
    else if (tutorialStep === "prep_hours_per_room") updateLabor({ prepHours: TUTORIAL_SAMPLE.labor.prepHours });
    else if (tutorialStep === "room_name") updateRoom({ name: TUTORIAL_SAMPLE.firstRoom.name });
    else if (tutorialStep === "length") updateRoom({ length: TUTORIAL_SAMPLE.firstRoom.length });
    else if (tutorialStep === "width") updateRoom({ width: TUTORIAL_SAMPLE.firstRoom.width });
    else if (tutorialStep === "wall_height") updateRoom({ height: TUTORIAL_SAMPLE.firstRoom.height });
    else if (tutorialStep === "surface_type") updateRoom({ surfaceType: TUTORIAL_SAMPLE.firstRoom.surfaceType });
    else if (tutorialStep === "choose_paint") updateRoom({ coats: TUTORIAL_SAMPLE.firstRoom.coats, paintBrand: TUTORIAL_SAMPLE.firstRoom.paintBrand, paintColorCode: TUTORIAL_SAMPLE.firstRoom.paintColorCode, pricePerContainerDollars: TUTORIAL_SAMPLE.firstRoom.pricePerContainerDollars });
    else if (tutorialStep === "gross_margin") setMargin(TUTORIAL_SAMPLE.grossMargin);
  }
  const tutorialCanContinue = (() => {
    if (tutorialStep === "estimate_name") return Boolean(title.trim());
    if (tutorialStep === "number_of_workers") return (numberValue(active.workers) ?? 0) > 0;
    if (tutorialStep === "average_hourly_wage") return (numberValue(active.wageDollars) ?? 0) >= 0;
    if (tutorialStep === "prep_hours_per_room") return (numberValue(active.prepHours) ?? 0) >= 0;
    if (tutorialStep === "room_name") return Boolean(active.name.trim());
    if (tutorialStep === "length") return (numberValue(active.length) ?? 0) > 0;
    if (tutorialStep === "width") return (numberValue(active.width) ?? 0) > 0;
    if (tutorialStep === "wall_height") return (numberValue(active.height) ?? 0) > 0;
    if (tutorialStep === "surface_type") return Boolean(active.surfaceType);
    if (tutorialStep === "choose_paint") return Boolean(active.paintBrand.trim() && active.paintColorCode.trim());
    return true;
  })();
  function addOpening() {
    updateRoom({ openings: [...active.openings, { id: crypto.randomUUID(), name: `Opening ${active.openings.length + 1}`, kind: "window", width: "", height: "", quantity: "1", subtractFromPaintableArea: true }] });
    if (tutorialMode && tutorialStep === "add_opening") tutorialStepComplete("add_opening");
  }
  async function addRoom() {
    if (roomAddPending.current || addingRoom || saving) return;
    roomAddPending.current = true;
    setAddingRoom(true);
    const tutorialRooms = tutorialMode ? rooms.map((room, index) => index === 0 ? {
      ...room,
      coats: TUTORIAL_SAMPLE.firstRoom.coats,
      paintBrand: TUTORIAL_SAMPLE.firstRoom.paintBrand,
      paintColorCode: TUTORIAL_SAMPLE.firstRoom.paintColorCode,
      pricePerContainerDollars: TUTORIAL_SAMPLE.firstRoom.pricePerContainerDollars,
    } : room) : rooms;
    const next = roomDraft(tutorialRooms.length + 1, { ...active, ...sharedLaborFromFirstRoom(tutorialRooms) });
    const completedNext = tutorialMode ? {
      ...next,
      ...TUTORIAL_SAMPLE.secondRoom,
      surfaceType: TUTORIAL_SAMPLE.secondRoom.surfaceType,
    } : next;
    const nextRooms = [...tutorialRooms, completedNext];
    setRooms(nextRooms);
    setActiveIndex(nextRooms.length - 1);
    try {
      if (!tutorialMode) await saveDraft(nextRooms);
      else if (tutorialStep === "add_room") tutorialStepComplete("add_room");
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
    if (!canPersistEstimate(estimateMode)) {
      setStatus("Tutorial estimates cannot be saved.");
      return;
    }
    if (saving) return;
    setSaving(true); setStatus("Saving draft…");
    const synchronizedRooms = synchronizeRoomLabor(roomsToSave);
    const savedCalculation = calculateDraft(synchronizedRooms, margin, initialOverheadPercent);
    const payload = {
      targetGrossMarginPercent: numberValue(margin) ?? ESTIMATION_ASSUMPTIONS.defaultGrossMarginPercent,
      rooms: synchronizedRooms.map((room, sortOrder) => ({
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
      console.error("estimate_draft_save_failed", { code: error.code, message: error.message });
      setStatus(friendlyEstimateError(error, "draft"));
      return;
    }
    setEstimateId(data);
    setStatus("Draft saved.");
    router.replace(`/dashboard/estimates/${data}/edit`);
    router.refresh();
    return data as string;
  }

  async function approve() {
    if (!calculation.valid) return setStatus("This estimate cannot be approved until all required information is complete.");
    if (!canPersistEstimate(estimateMode)) {
      setStatus("Tutorial estimates cannot be approved.");
      return;
    }
    const id = await saveDraft(rooms);
    if (!id) return;
    const confirmed = window.confirm("Approving this estimate will lock dimensions, paint selections, labor assumptions, material costs, and customer price. Future scope changes require a revision or change order.");
    if (!confirmed) return;
    setSaving(true);
    setStatus("Approving estimate…");
    const { error } = await createClient().rpc("approve_estimate", { target_estimate: id });
    setSaving(false);
    if (error) {
      console.error("estimate_approval_failed", { code: error.code, message: error.message });
      return setStatus(friendlyEstimateError(error, "approval"));
    }
    router.replace(`/dashboard/estimates/${id}`);
    router.refresh();
  }

  async function finishTutorial() {
    setTutorialCompleteOpen(true);
    trackTutorialEvent("tutorial_completed", { kept: false });
    const { error } = await createClient().rpc("complete_estimate_tutorial", { tutorial_version: ESTIMATE_TUTORIAL_VERSION });
    if (error) console.error("tutorial_completion_metadata_failed", { code: error.code });
  }

  function closeCompletedTutorial() {
    router.replace("/dashboard");
    router.refresh();
  }

  function restartTutorial() {
    setTutorialCompleteOpen(false);
    router.replace("/dashboard?tutorial=1");
  }

  function exitTutorial() {
    trackTutorialEvent("tutorial_exited", { step: tutorialStep });
    setTutorialExitOpen(true);
  }

  async function discardExitedTutorial() {
    trackTutorialEvent("tutorial_estimate_discarded", { action: "exit" });
    router.replace("/dashboard");
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

  const numeric = (label: string, key: keyof RoomDraft, suffix?: string, prefix?: string) => {
    const tutorialId = key === "length" ? "room-length" : key === "width" ? "room-width" : key === "height" ? "wall-height" : undefined;
    return <div data-tutorial-id={tutorialId}><NumericInput label={label} value={String(active[key])} onChange={value => updateRoom({ [key]: value })} suffix={suffix} prefix={prefix}/></div>;
  };
  const labor = sharedLaborFromFirstRoom(rooms);

  return <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
    <main className="min-w-0 space-y-6">
    <section className="rounded-xl border border-border bg-surface p-5">
      <label data-tutorial-id="estimate-name" className="block text-sm font-medium">Estimate name<input value={title} onChange={event => setTitle(event.target.value)} placeholder="Untitled draft" className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"/></label>
      <div data-tutorial-id="labor-setup" className="mt-5 border-t border-border pt-5">
        <h2 className="text-xl font-semibold">Labor Setup</h2>
        <p className="mt-1 text-sm text-muted">These labor settings apply to every room in this estimate.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div data-tutorial-id="number-of-workers"><NumericInput label="Number of Workers" value={labor.workers} onChange={value=>updateLabor({workers:value})}/></div>
          <div data-tutorial-id="average-hourly-wage"><NumericInput label="Average Hourly Wage" value={labor.wageDollars} prefix="$" onChange={value=>updateLabor({wageDollars:value})}/></div>
          <div data-tutorial-id="prep-hours-per-room"><NumericInput label={PREP_HOURS_LABEL} value={labor.prepHours} suffix="person-hr" onChange={value=>updateLabor({prepHours:value})}/></div>
        </div>
      </div>
      <button data-tutorial-id="add-room" type="button" onClick={addRoom} disabled={addingRoom || saving} className="mt-3 min-h-11 rounded-lg border border-brand px-4 font-semibold text-brand disabled:opacity-50">{addingRoom ? "Adding room…" : "Add Room"}</button>
      <nav aria-label="Estimate rooms" className="mt-5 flex flex-wrap gap-2">{rooms.map((room,index) =>
        <button key={room.id} onClick={() => setActiveIndex(index)} aria-current={index===activeIndex ? "page" : undefined} className={`min-h-11 rounded-lg border px-4 text-sm font-semibold ${index===activeIndex ? "border-brand bg-brand text-white" : "border-border"}`}>{room.name}</button>)}</nav>
    </section>

    <section data-tutorial-id="room-dimensions" className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">Room Dimensions</h2><p className="text-sm text-muted">Enter length, width, and wall height to calculate gross wall surface.</p></div><button type="button" onClick={() => removeRoom(active.id)} disabled={rooms.length === 1 || saving} title={rooms.length === 1 ? "At least one room is required." : "Remove this room"} className="text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-40">Remove room</button></div>
      <label data-tutorial-id="room-name" className="mt-4 block text-sm font-medium">Room name<input value={active.name} onChange={event => updateRoom({name:event.target.value})} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"/></label>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">{numeric("Length","length","ft")}{numeric("Width","width","ft")}{numeric("Wall Height","height","ft")}</div>
      <label data-tutorial-id="surface-type" className="mt-4 block text-sm font-medium">Surface Type<select required value={active.surfaceType} onChange={event=>updateRoom({surfaceType:event.target.value as SurfaceTypeKey|""})} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-white px-3"><option value="">Select a surface type</option>{SURFACE_TYPES.map(surface=><option key={surface.key} value={surface.key}>{surface.label}</option>)}</select></label>
    </section>

    <section className="rounded-xl border border-border bg-surface p-5">
      <div><h2 className="text-xl font-semibold">Openings</h2><p className="text-sm text-muted">Deduct windows, doors, and other non-paintable areas from gross wall area.</p></div>
      <div className="mt-4 space-y-3">{active.openings.map(opening => <div data-tutorial-id="opening-details" key={opening.id} className="grid gap-3 rounded-lg bg-background p-3 sm:grid-cols-2 lg:grid-cols-7">
        <label className="text-sm">Opening type<select value={opening.kind} onChange={event=>updateOpening(opening.id,{kind:event.target.value as OpeningKind})} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="window">Window</option><option value="door">Door</option><option value="archway">Archway</option><option value="closet_opening">Closet Opening</option><option value="pass_through">Pass-Through</option><option value="other">Other</option></select></label>
        <label className="text-sm">Name<input value={opening.name} onChange={e=>updateOpening(opening.id,{name:e.target.value})} className="mt-1 min-h-11 w-full rounded-lg border px-3"/></label>
        <NumericInput label="Width" value={opening.width} suffix="ft" onChange={value=>updateOpening(opening.id,{width:value})}/>
        <NumericInput label="Height" value={opening.height} suffix="ft" onChange={value=>updateOpening(opening.id,{height:value})}/>
        <NumericInput label="Quantity" value={opening.quantity} onChange={value=>updateOpening(opening.id,{quantity:value})}/>
        <label className="flex min-h-11 items-center gap-2 self-end text-sm"><input type="checkbox" checked={opening.subtractFromPaintableArea !== false} onChange={event=>updateOpening(opening.id,{subtractFromPaintableArea:event.target.checked})}/>Subtract from Paintable Area</label>
        <p className="self-end pb-3 text-sm">Area: <strong>{((numberValue(opening.width)??0)*(numberValue(opening.height)??0)*(numberValue(opening.quantity)??0)).toFixed(1)} ft²</strong></p>
        <button onClick={()=>updateRoom({openings:active.openings.filter(item=>item.id!==opening.id)})} className="self-end min-h-11 text-sm font-semibold text-red-700">Remove Opening</button>
      </div>)}</div>
      <button data-tutorial-id="add-opening" type="button" onClick={addOpening} className="mt-4 min-h-11 rounded-lg border border-brand px-4 font-semibold text-brand">Add Opening</button>
    </section>

    <section data-tutorial-id="choose-paint" className="rounded-xl border border-border bg-surface p-5"><h2 className="text-xl font-semibold">Choose Your Paint</h2>
      <p className="mt-1 text-sm text-muted">Record the manufacturer and color identifier used for this room.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Paint Brand<input required value={active.paintBrand} onChange={event=>updateRoom({paintBrand:event.target.value})} placeholder="e.g. Sherwin-Williams" className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"/></label>
        <label className="text-sm font-medium">Paint Color Code<input required value={active.paintColorCode} onChange={event=>updateRoom({paintColorCode:event.target.value})} placeholder="e.g. SW 7005" className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"/></label>
      </div>
    </section>

    <section data-tutorial-id="paint-materials" className="rounded-xl border border-border bg-surface p-5"><h2 className="text-xl font-semibold">Paint Materials</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">{numeric("Number of Coats","coats")}{numeric("Container Size","containerSizeGallons","gal")}{numeric("Price per Container","pricePerContainerDollars",undefined,"$")}</div>
      {canManageFinancials && activeResult && <dl className="mt-4 grid gap-3 rounded-lg bg-background p-4 sm:grid-cols-3">
        <div><dt className="text-xs text-muted">Base Coverage Rate</dt><dd className="font-mono">{ESTIMATION_ASSUMPTIONS.baseCoverageRateSqFtPerGallon} ft²/gal</dd></div>
        <div><dt className="text-xs text-muted">Surface Type</dt><dd className="font-medium">{activeResult.surfaceLabel}</dd></div>
        <div><dt className="text-xs text-muted">Surface Modifier</dt><dd className="font-mono">{activeResult.surfaceModifier.toFixed(2)}</dd></div>
        <div><dt className="text-xs text-muted">Effective Coverage Rate</dt><dd className="font-mono">{activeResult.effectiveCoverageRateSqFtPerGallon.toFixed(2)} ft²/gal</dd></div>
        <div><dt className="text-xs text-muted">Raw Gallons Required</dt><dd className="font-mono">{activeResult.rawGallonsRequired.toFixed(3)} gal</dd></div>
        <div><dt className="text-xs text-muted">Purchased Paint</dt><dd className="font-mono">{activeResult.purchaseQuantity} × {activeResult.containerSizeGallons} gal</dd></div>
      </dl>}
    </section>

    <section data-tutorial-id="save-or-approve" className="rounded-xl bg-[#16251d] p-5 text-white">
      <p className="text-sm text-emerald-100/70">Formula {ESTIMATION_ASSUMPTIONS.formulaVersion}. This estimate snapshots {initialOverheadPercent}% project overhead and its saved labor assumptions.</p>
      {canManageFinancials && <label data-tutorial-id="gross-margin" className="mt-4 block font-medium" htmlFor="target-margin">Target Gross Margin <strong className="float-right">{margin}%</strong><input id="target-margin" aria-valuetext={`${margin} percent target gross margin`} type="range" min="0" max={ESTIMATION_ASSUMPTIONS.maximumGrossMarginPercent} step="1" value={margin} onChange={event=>setMargin(event.target.value)} className="mt-4 w-full accent-emerald-400"/></label>}
      {!calculation.valid && <p role="alert" className="mt-3 rounded-lg bg-amber-100 p-3 text-sm text-amber-950">{calculation.error}</p>}
      {!tutorialMode && <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button onClick={() => saveDraft()} disabled={saving} className="min-h-12 rounded-lg bg-white font-semibold text-emerald-950 disabled:opacity-60">{saving ? "Saving…" : "Save as Draft"}</button>
        {canManageFinancials && <button onClick={() => approve()} disabled={!calculation.valid} className="min-h-12 rounded-lg bg-emerald-400 font-semibold text-emerald-950 disabled:opacity-50">Approve Estimate</button>}
      </div>}
      {tutorialMode && <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={exitTutorial} className="min-h-11 rounded-lg border border-white/25 px-4 font-semibold">Exit Tutorial</button><button type="button" onClick={restartTutorial} className="min-h-11 px-4 font-semibold text-emerald-200">Restart Tutorial</button></div>}
      {!tutorialMode && canManageFinancials && estimateId && <button type="button" onClick={deleteDraft} disabled={saving} className="mt-5 min-h-11 text-sm font-semibold text-red-300 underline-offset-4 hover:underline disabled:opacity-50">Delete Draft</button>}
      {status && <p role="status" className="mt-3 text-sm">{status}</p>}
    </section>
    </main>
    <aside data-tutorial-id="estimate-summary" className="min-w-0 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
      <EstimateSummary result={calculation.result} targetMargin={margin}/>
    </aside>
    {tutorialMode && !tutorialCompleteOpen && <EstimateTutorialCoach step={tutorialStep} canContinue={tutorialCanContinue} error={tutorialError} onFill={fillTutorialExample} onContinue={() => tutorialStep === "live_estimate_summary" ? finishTutorial() : tutorialStepComplete(tutorialStep)} onBack={() => { const index = ESTIMATE_TUTORIAL_STEPS.indexOf(tutorialStep); if (index > 0) setTutorialStep(ESTIMATE_TUTORIAL_STEPS[index - 1]); }} onExit={exitTutorial}/>}
    {tutorialCompleteOpen && <TutorialCompletionModal onFinish={closeCompletedTutorial} onRestart={restartTutorial}/>}
    {tutorialExitOpen && <TutorialExitModal onDiscard={discardExitedTutorial} onCancel={() => setTutorialExitOpen(false)}/>}
  </div>;
}
