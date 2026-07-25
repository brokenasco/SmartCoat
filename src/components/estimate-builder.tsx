"use client";

import { useMemo, useState } from "react";
import { PaintSelector } from "@/components/paint-selector";
import { calculateEstimate } from "@/lib/domain/estimate-engine";
import type { EstimatePaintSelection } from "@/lib/domain/paint-catalog";
import { formatMoney } from "@/lib/domain/pricing";
import { getEstimatedRetailerPrice } from "@/lib/domain/retailer-pricing";
import { createClient } from "@/lib/supabase/browser";

type Form = {
  name: string; length: number; width: number; height: number;
  window1Width: number; window1Height: number; window2Width: number; window2Height: number;
  coats: number; coverage: number; coverageReason: string; waste: number; workers: number;
  wage: number; burden: number; productionRate: number; prepHours: number; overhead: number;
  margin: number; zip: string; retailer: "home_depot" | "lowes";
};

export function EstimateBuilder({ companyId, brands }: {
  companyId: string;
  brands: { id: string; name: string }[];
}) {
  const [form, setForm] = useState<Form>({
    name: "", length: 15, width: 12, height: 8,
    window1Width: 3, window1Height: 4, window2Width: 4, window2Height: 5,
    coats: 2, coverage: 400, coverageReason: "", waste: 10, workers: 2,
    wage: 2500, burden: 20, productionRate: 150, prepHours: 2, overhead: 10,
    margin: 45, zip: "33601", retailer: "home_depot",
  });
  const [paint, setPaint] = useState<EstimatePaintSelection>({
    paintColorId: null, brandName: null, colorName: null, colorCode: null,
    productName: null, sheen: null, coverageRate: 400,
    coverageSource: "company_default", coverageWasOverridden: false,
    coverageOverrideReason: null,
  });
  const [status, setStatus] = useState("");
  const pricing = useMemo(
    () => getEstimatedRetailerPrice(form.retailer, /^\d{5}$/.test(form.zip) ? form.zip : "00000"),
    [form.retailer, form.zip],
  );
  const result = useMemo(() => calculateEstimate({
    room: { lengthFeet: form.length, widthFeet: form.width, heightFeet: form.height },
    openings: [
      { kind: "window", widthFeet: form.window1Width, heightFeet: form.window1Height },
      { kind: "window", widthFeet: form.window2Width, heightFeet: form.window2Height },
    ],
    coats: form.coats, coverageSqFtPerGallon: form.coverage, wastePercent: form.waste,
    paintPricePerGallonCents: pricing.pricePerGallonCents,
    productionRateSqFtPerHour: form.productionRate, prepHours: form.prepHours,
    crewSize: form.workers, averageWageCentsPerHour: form.wage,
    laborBurdenPercent: form.burden, overheadPercent: form.overhead,
    targetGrossMarginPercent: form.margin, productiveHoursPerDay: 8,
    retailer: form.retailer, zipCode: /^\d{5}$/.test(form.zip) ? form.zip : "00000",
    pricingSource: pricing.source, pricingTimestamp: pricing.updatedAt,
  }), [form, pricing]);

  function set(name: keyof Form, value: string) {
    setForm(current => ({
      ...current,
      [name]: ["name", "zip", "retailer", "coverageReason"].includes(name) ? value : Number(value),
    } as Form));
  }

  async function save() {
    if (!form.name.trim()) return setStatus("Give this estimate a name first.");
    if (!/^\d{5}$/.test(form.zip)) return setStatus("Enter a valid five-digit ZIP code.");
    if (form.coverage !== 400 && !form.coverageReason.trim()) {
      return setStatus("Explain why the default paint coverage was overridden.");
    }
    setStatus("Saving…");
    const paintSnapshot = {
      ...paint,
      coverageRate: form.coverage,
      coverageSource: form.coverage === 400 ? "company_default" as const : "manual_override" as const,
      coverageWasOverridden: form.coverage !== 400,
      coverageOverrideReason: form.coverage === 400 ? null : form.coverageReason.trim(),
    };
    const supabase = createClient();
    const { data, error } = await supabase.from("estimates").insert({
      company_id: companyId, title: form.name, status: "draft",
      subtotal_cents: result.customerSubtotalCents, tax_cents: result.taxCents,
      total_cents: result.customerEstimateCents, cost_cents: result.totalContractorCostCents,
      target_margin_percent: form.margin,
      calculation_snapshot: { formulaVersion: result.formulaVersion, inputs: form, paint: paintSnapshot, result },
    }).select("id").single();
    if (error) return setStatus(error.message);
    const { error: paintError } = await supabase.from("estimate_paint_items").insert({
      company_id: companyId, estimate_id: data.id, paint_color_id: paintSnapshot.paintColorId,
      brand_name_snapshot: paintSnapshot.brandName, color_name_snapshot: paintSnapshot.colorName,
      color_code_snapshot: paintSnapshot.colorCode, product_name_snapshot: paintSnapshot.productName,
      sheen_snapshot: paintSnapshot.sheen, coverage_rate_snapshot: form.coverage,
      coverage_source: paintSnapshot.coverageSource,
      coverage_was_overridden: paintSnapshot.coverageWasOverridden,
      coverage_override_reason: paintSnapshot.coverageOverrideReason,
      number_of_coats: form.coats, waste_percentage: form.waste,
      calculated_gallons: result.rawGallonsRequired, purchase_quantity: result.recommendedGallons,
      unit_price_snapshot: pricing.pricePerGallonCents, price_source_snapshot: pricing.source,
      price_collected_at: pricing.updatedAt, retailer_snapshot: form.retailer,
      postal_code_snapshot: form.zip,
    });
    setStatus(paintError
      ? `Draft saved, but paint snapshot failed: ${paintError.message}`
      : `Draft ${data.id.slice(0, 8)} saved.`);
  }

  const field = (label: string, name: keyof Form, step = "1") => (
    <label className="text-sm font-medium">{label}<input value={form[name]} onChange={event => set(name, event.target.value)} type="number" min="0" step={step} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3 font-mono"/></label>
  );

  return <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
    <section className="space-y-6 rounded-xl border border-border bg-surface p-6">
      <div><h2 className="font-semibold">Estimate details</h2><p className="text-sm text-muted">Formula {result.formulaVersion} keeps takeoff, labor, duration, and pricing consistent everywhere.</p></div>
      <label className="block text-sm font-medium">Estimate name<input value={form.name} onChange={event => set("name", event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"/></label>
      <PaintSelector brands={brands} value={paint} onChange={setPaint}/>
      <div className="grid gap-4 sm:grid-cols-3">{field("Length (ft)", "length", ".01")}{field("Width (ft)", "width", ".01")}{field("Height (ft)", "height", ".01")}{field("Coats", "coats")}{field("Coverage (ft²/gal)", "coverage")}{field("Waste %", "waste", ".1")}</div>
      {form.coverage !== 400 && <label className="block text-sm font-medium">Coverage override reason<input value={form.coverageReason} onChange={event => set("coverageReason", event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" placeholder="Required for audit history"/></label>}
      <div className="grid gap-4 sm:grid-cols-4">{field("Window 1 width", "window1Width", ".01")}{field("Window 1 height", "window1Height", ".01")}{field("Window 2 width", "window2Width", ".01")}{field("Window 2 height", "window2Height", ".01")}</div>
      <div className="rounded-lg bg-background p-4"><dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><Metric l="Gross walls" v={`${result.grossSurfaceAreaSqFt} ft²`}/><Metric l="Openings" v={`−${result.deductedOpeningAreaSqFt} ft²`}/><Metric l="Net walls" v={`${result.netPaintableAreaSqFt} ft²`}/><Metric l="Paint" v={`${result.rawGallonsRequired} → ${result.recommendedGallons} gal`}/></dl></div>
      <div className="grid gap-4 sm:grid-cols-3">{field("Workers", "workers")}{field("Average wage (¢/hr)", "wage")}{field("Labor burden %", "burden", ".1")}{field("Production ft²/hr", "productionRate", ".1")}{field("Prep hours", "prepHours", ".25")}{field("Overhead %", "overhead", ".1")}</div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Retailer<select value={form.retailer} onChange={event => set("retailer", event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"><option value="home_depot">Home Depot</option><option value="lowes">Lowe&apos;s</option></select></label><label className="text-sm font-medium">ZIP code<input value={form.zip} inputMode="numeric" maxLength={5} onChange={event => set("zip", event.target.value.replace(/\D/g, "").slice(0, 5))} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"/></label></div>
    </section>
    <aside className="h-fit rounded-xl bg-[#16251d] p-6 text-white">
      <label className="block text-sm">Target gross margin <span className="float-right font-mono">{form.margin}%</span><input aria-label="Target gross margin" type="range" min="0" max="70" value={form.margin} onChange={event => set("margin", event.target.value)} className="mt-3 w-full accent-emerald-400"/></label>
      <dl className="mt-7 space-y-3 border-y border-white/10 py-5 text-sm"><Row l="Materials (estimated)" v={formatMoney(result.materialSubtotalCents)}/><Row l="Wages" v={formatMoney(result.wageCostCents)}/><Row l="Labor burden" v={formatMoney(result.laborBurdenCents)}/><Row l="Overhead" v={formatMoney(result.overheadCents)}/><Row l="Contractor cost" v={formatMoney(result.totalContractorCostCents)}/><Row l="Expected gross profit" v={formatMoney(result.expectedGrossProfitCents)}/></dl>
      <p className="mt-5 text-xs text-emerald-100/60">Recommended customer price</p><p className="font-mono text-3xl">{formatMoney(result.customerEstimateCents)}</p>
      <p className="mt-2 text-xs text-emerald-100/70">{result.laborHours} labor hours · {result.estimatedWorkingDays} working days with {result.crewSize} workers</p><p className="mt-4 text-xs text-amber-200">{result.warnings.join(" ")}</p>
      <button onClick={save} className="mt-6 min-h-12 w-full rounded-lg bg-emerald-400 font-semibold text-emerald-950">Save draft</button>{status && <p role="status" className="mt-3 text-sm">{status}</p>}
    </aside>
  </div>;
}

function Metric({ l, v }: { l: string; v: string }) { return <div><dt className="text-muted">{l}</dt><dd className="font-mono font-semibold">{v}</dd></div>; }
function Row({ l, v }: { l: string; v: string }) { return <div className="flex justify-between gap-4"><dt>{l}</dt><dd className="font-mono">{v}</dd></div>; }
