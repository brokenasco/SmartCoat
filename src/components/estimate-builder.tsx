"use client";

import { useMemo, useState } from "react";
import { NumericInput } from "@/components/numeric-input";
import { PaintSelector } from "@/components/paint-selector";
import { tryCalculateEstimate } from "@/lib/domain/estimate-engine";
import type { EstimatePaintSelection } from "@/lib/domain/paint-catalog";
import { parseNumericInput } from "@/lib/domain/numeric-input";
import { formatMoney } from "@/lib/domain/pricing";
import { unavailableRetailerPrice } from "@/lib/domain/retailer-pricing";
import { createClient } from "@/lib/supabase/browser";

type NumericField =
  | "length" | "width" | "height" | "window1Width" | "window1Height"
  | "window2Width" | "window2Height" | "coats" | "coverage" | "waste"
  | "workers" | "wageDollars" | "burden" | "productionRate" | "prepHours"
  | "overhead" | "margin" | "containerSizeGallons" | "containerQuantity"
  | "pricePerContainerDollars";

type Draft = Record<NumericField, string> & {
  name: string;
  coverageReason: string;
  projectPostalCode: string;
};

const initialDraft: Draft = {
  name: "", length: "15", width: "12", height: "8",
  window1Width: "3", window1Height: "4", window2Width: "4", window2Height: "5",
  coats: "2", coverage: "400", coverageReason: "", waste: "10", workers: "2",
  wageDollars: "25.00", burden: "20", productionRate: "150", prepHours: "2",
  overhead: "10", margin: "45", containerSizeGallons: "1",
  containerQuantity: "3", pricePerContainerDollars: "0.00", projectPostalCode: "",
};

function parsed(raw: string) {
  const result = parseNumericInput(raw);
  return result.state === "valid" ? result.value : null;
}

export function EstimateBuilder({ companyId, brands }: {
  companyId: string;
  brands: { id: string; name: string }[];
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [paint, setPaint] = useState<EstimatePaintSelection>({
    paintColorId: null, brandName: null, colorName: null, colorCode: null,
    productName: null, productType: null, projectUse: "interior", sheen: null,
    coverageRate: 400, coverageSource: "company_default",
    coverageWasOverridden: false, coverageOverrideReason: null,
    containerSizeGallons: 1, containerQuantity: 3, pricePerContainerCents: 0,
    retailerName: null, notes: null, isManualEntry: true,
  });
  const [status, setStatus] = useState("");

  const input = useMemo(() => {
    const values = {
      length: parsed(draft.length), width: parsed(draft.width), height: parsed(draft.height),
      window1Width: parsed(draft.window1Width), window1Height: parsed(draft.window1Height),
      window2Width: parsed(draft.window2Width), window2Height: parsed(draft.window2Height),
      coats: parsed(draft.coats), coverage: parsed(draft.coverage), waste: parsed(draft.waste),
      workers: parsed(draft.workers), wageDollars: parsed(draft.wageDollars),
      burden: parsed(draft.burden), productionRate: parsed(draft.productionRate),
      prepHours: parsed(draft.prepHours), overhead: parsed(draft.overhead),
      margin: parsed(draft.margin), containerSizeGallons: parsed(draft.containerSizeGallons),
      containerQuantity: parsed(draft.containerQuantity),
      pricePerContainerDollars: parsed(draft.pricePerContainerDollars),
    };
    if (Object.values(values).some(value => value === null)) return null;
    return {
      room: { lengthFeet: values.length!, widthFeet: values.width!, heightFeet: values.height! },
      openings: [
        { kind: "window" as const, widthFeet: values.window1Width!, heightFeet: values.window1Height! },
        { kind: "window" as const, widthFeet: values.window2Width!, heightFeet: values.window2Height! },
      ],
      coats: values.coats!, coverageSqFtPerGallon: values.coverage!, wastePercent: values.waste!,
      containerSizeGallons: values.containerSizeGallons!,
      containerQuantity: values.containerQuantity!,
      pricePerContainerCents: Math.round(values.pricePerContainerDollars! * 100),
      productionRateSqFtPerHour: values.productionRate!, prepHours: values.prepHours!,
      crewSize: values.workers!, averageWageCentsPerHour: Math.round(values.wageDollars! * 100),
      laborBurdenPercent: values.burden!, overheadPercent: values.overhead!,
      targetGrossMarginPercent: values.margin!, productiveHoursPerDay: 8,
      retailer: "manual_supplier" as const,
      projectPostalCode: draft.projectPostalCode || undefined,
      pricingSource: "manual" as const,
      pricingTimestamp: new Date().toISOString(),
    };
  }, [draft]);
  const calculation = useMemo(
    () => input ? tryCalculateEstimate(input) : { ok: false as const, value: null, errors: [{ field: "estimate", message: "Complete the numeric inputs to calculate." }] },
    [input],
  );
  const result = calculation.value;

  function setNumeric(name: NumericField, raw: string) {
    setDraft(current => ({ ...current, [name]: raw }));
  }

  async function save() {
    if (!draft.name.trim()) return setStatus("Give this estimate a name first.");
    if (!result || !input) return setStatus(calculation.errors[0]?.message ?? "Complete all required estimate inputs.");
    if (draft.projectPostalCode && !/^\d{5}$/.test(draft.projectPostalCode)) return setStatus("Project ZIP code must contain five digits.");
    if (input.coverageSqFtPerGallon !== 400 && !draft.coverageReason.trim()) return setStatus("Explain why the default paint coverage was overridden.");
    setStatus("Saving…");
    const paintSnapshot = {
      ...paint,
      coverageRate: input.coverageSqFtPerGallon,
      coverageSource: input.coverageSqFtPerGallon === 400 ? "company_default" as const : "manual_override" as const,
      coverageWasOverridden: input.coverageSqFtPerGallon !== 400,
      coverageOverrideReason: input.coverageSqFtPerGallon === 400 ? null : draft.coverageReason.trim(),
      containerSizeGallons: input.containerSizeGallons,
      containerQuantity: result.purchaseQuantity,
      pricePerContainerCents: input.pricePerContainerCents,
    };
    const supabase = createClient();
    const { data, error } = await supabase.from("estimates").insert({
      company_id: companyId, title: draft.name.trim(), status: "draft",
      subtotal_cents: result.customerSubtotalCents, tax_cents: result.taxCents,
      total_cents: result.customerEstimateCents, cost_cents: result.totalContractorCostCents,
      target_margin_percent: input.targetGrossMarginPercent,
      calculation_snapshot: { formulaVersion: result.formulaVersion, inputs: input, paint: paintSnapshot, result },
    }).select("id").single();
    if (error) return setStatus(error.message);
    const { error: paintError } = await supabase.from("estimate_paint_items").insert({
      company_id: companyId, estimate_id: data.id, paint_color_id: paintSnapshot.paintColorId,
      brand_name_snapshot: paintSnapshot.brandName, color_name_snapshot: paintSnapshot.colorName,
      color_code_snapshot: paintSnapshot.colorCode, product_name_snapshot: paintSnapshot.productName,
      product_type_snapshot: paintSnapshot.productType, project_use_snapshot: paintSnapshot.projectUse,
      sheen_snapshot: paintSnapshot.sheen, coverage_rate_snapshot: input.coverageSqFtPerGallon,
      coverage_source: paintSnapshot.coverageSource,
      coverage_was_overridden: paintSnapshot.coverageWasOverridden,
      coverage_override_reason: paintSnapshot.coverageOverrideReason,
      number_of_coats: input.coats, waste_percentage: input.wastePercent,
      calculated_gallons: result.rawGallonsRequired, purchase_quantity: result.gallonsPurchased,
      is_manual_entry: paintSnapshot.isManualEntry,
      container_volume_snapshot: input.containerSizeGallons,
      container_volume_unit_snapshot: "gallon",
      container_gallons_snapshot: input.containerSizeGallons,
      container_quantity_snapshot: result.purchaseQuantity,
      price_per_container_cents_snapshot: input.pricePerContainerCents,
      gallons_purchased_snapshot: result.gallonsPurchased,
      excess_gallons_snapshot: result.excessGallons,
      unit_price_snapshot: input.pricePerContainerCents,
      price_source_snapshot: "manual supplier price",
      price_collected_at: input.pricingTimestamp,
      price_availability_snapshot: "manual",
      retailer_snapshot: paintSnapshot.retailerName,
      postal_code_snapshot: draft.projectPostalCode || null,
      notes_snapshot: paintSnapshot.notes,
    });
    setStatus(paintError ? `Draft saved, but paint snapshot failed: ${paintError.message}` : `Draft ${data.id.slice(0, 8)} saved.`);
  }

  const numberField = (
    label: string, name: NumericField,
    options: { min?: number; max?: number; integer?: boolean; prefix?: string; suffix?: string } = {},
  ) => <NumericInput label={label} value={draft[name]} onChange={raw => setNumeric(name, raw)} {...options}/>;
  const homeDepot = unavailableRetailerPrice("home_depot", false);
  const lowes = unavailableRetailerPrice("lowes", false);

  return <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
    <section className="space-y-6 rounded-xl border border-border bg-surface p-6">
      <div><h2 className="font-semibold">Estimate details</h2><p className="text-sm text-muted">Formula {result?.formulaVersion ?? "3.0.0"} calculates only after every required numeric field is valid.</p></div>
      <label className="block text-sm font-medium">Estimate name<input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"/></label>
      <PaintSelector brands={brands} value={paint} onChange={setPaint}/>
      <div className="grid gap-4 sm:grid-cols-3">{numberField("Length", "length", { min: 0.01, suffix: "ft" })}{numberField("Width", "width", { min: 0.01, suffix: "ft" })}{numberField("Wall height", "height", { min: 0.01, suffix: "ft" })}{numberField("Number of coats", "coats", { min: 1, max: 10, integer: true })}{numberField("Coverage", "coverage", { min: 1, suffix: "ft²/gal" })}{numberField("Waste", "waste", { min: 0, max: 100, suffix: "%" })}</div>
      {parsed(draft.coverage) !== 400 && <label className="block text-sm font-medium">Coverage override reason<input value={draft.coverageReason} onChange={event => setDraft(current => ({ ...current, coverageReason: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" placeholder="Required for audit history"/></label>}
      <div className="grid gap-4 sm:grid-cols-4">{numberField("Window 1 width", "window1Width", { min: 0, suffix: "ft" })}{numberField("Window 1 height", "window1Height", { min: 0, suffix: "ft" })}{numberField("Window 2 width", "window2Width", { min: 0, suffix: "ft" })}{numberField("Window 2 height", "window2Height", { min: 0, suffix: "ft" })}</div>
      <div className="grid gap-4 sm:grid-cols-3">{numberField("Gallons per Container", "containerSizeGallons", { min: 0.01, suffix: "gal" })}{numberField("Container Quantity", "containerQuantity", { min: 1, integer: true })}{numberField("Price per Container", "pricePerContainerDollars", { min: 0, prefix: "$" })}</div>
      {result && <div className="rounded-lg bg-background p-4"><dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><Metric l="Net walls" v={`${result.netPaintableAreaSqFt} ft²`}/><Metric l="Raw paint required" v={`${result.rawGallonsRequired} gal`}/><Metric l="Containers required" v={`${result.containersRequired}`}/><Metric l="Containers purchased" v={`${result.purchaseQuantity}`}/><Metric l="Gallons purchased" v={`${result.gallonsPurchased} gal`}/><Metric l="Excess paint" v={`${result.excessGallons} gal`}/><Metric l="Unit price" v={formatMoney(result.pricePerContainerCents)}/><Metric l="Paint cost" v={formatMoney(result.paintCostCents)}/></dl></div>}
      {!result && <p role="status" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Complete all numeric fields to resume calculation. Blank and partial values are safe while editing.</p>}
      <div className="grid gap-4 sm:grid-cols-3">{numberField("Workers", "workers", { min: 1, integer: true })}{numberField("Average Hourly Wage per Worker", "wageDollars", { min: 0.01, prefix: "$", suffix: "/hr" })}{numberField("Labor burden", "burden", { min: 0, max: 100, suffix: "%" })}{numberField("Production rate", "productionRate", { min: 0.01, suffix: "ft²/hr" })}{numberField("Prep hours", "prepHours", { min: 0, suffix: "person-hr" })}{numberField("Overhead", "overhead", { min: 0, max: 100, suffix: "%" })}</div>
      <section className="rounded-lg border border-border p-4"><h3 className="font-semibold">Retailer pricing</h3><p className="mt-1 text-sm text-muted">Prices require an exact product variant, sheen, base, container, and authorized retailer listing. ZIP code is not used.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><RetailerState name="Home Depot" message={homeDepot.status === "available" ? "Authorized exact-product price available." : homeDepot.message}/><RetailerState name="Lowe's" message={lowes.status === "available" ? "Authorized exact-product price available." : lowes.message}/></div></section>
      <label className="block max-w-sm text-sm font-medium">Project ZIP code <span className="font-normal text-muted">(location only)</span><input value={draft.projectPostalCode} inputMode="numeric" maxLength={5} onChange={event => setDraft(current => ({ ...current, projectPostalCode: event.target.value.replace(/\D/g, "").slice(0, 5) }))} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"/><span className="mt-1 block text-xs font-normal text-muted">Does not affect paint price, retailer, taxes, or estimate total.</span></label>
    </section>
    <aside className="h-fit rounded-xl bg-[#16251d] p-6 text-white">
      <NumericInput label="Target gross margin" value={draft.margin} min={0} max={99.99} suffix="%" onChange={raw => setNumeric("margin", raw)} className="text-white"/>
      {result ? <><dl className="mt-7 space-y-3 border-y border-white/10 py-5 text-sm"><Row l="Paint containers" v={formatMoney(result.paintCostCents)}/><Row l="Wages" v={formatMoney(result.wageCostCents)}/><Row l="Labor burden" v={formatMoney(result.laborBurdenCents)}/><Row l="Overhead" v={formatMoney(result.overheadCents)}/><Row l="Contractor cost" v={formatMoney(result.totalContractorCostCents)}/><Row l="Expected gross profit" v={formatMoney(result.expectedGrossProfitCents)}/></dl><p className="mt-5 text-xs text-emerald-100/60">Recommended customer price</p><p className="font-mono text-3xl">{formatMoney(result.customerEstimateCents)}</p><p className="mt-2 text-xs text-emerald-100/70">{result.laborHours} total person-hours · {result.estimatedElapsedHours} elapsed crew hours · {result.estimatedWorkingDays} working days</p><p className="mt-4 text-xs text-amber-200">{result.warnings.join(" ")}</p></> : <p className="mt-6 rounded-lg bg-white/10 p-4 text-sm">Calculation paused while an input is incomplete.</p>}
      <button onClick={save} disabled={!result} className="mt-6 min-h-12 w-full rounded-lg bg-emerald-400 font-semibold text-emerald-950 disabled:cursor-not-allowed disabled:opacity-50">Save draft</button>{status && <p role="status" className="mt-3 text-sm">{status}</p>}
    </aside>
  </div>;
}

function Metric({ l, v }: { l: string; v: string }) { return <div><dt className="text-muted">{l}</dt><dd className="font-mono font-semibold">{v}</dd></div>; }
function Row({ l, v }: { l: string; v: string }) { return <div className="flex justify-between gap-4"><dt>{l}</dt><dd className="font-mono">{v}</dd></div>; }
function RetailerState({ name, message }: { name: string; message: string }) { return <div className="rounded-lg bg-background p-3"><p className="font-medium">{name}</p><p className="mt-1 text-xs text-muted">{message}</p></div>; }
