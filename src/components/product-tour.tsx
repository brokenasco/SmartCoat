"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, RotateCcw, Sparkles, X } from "lucide-react";
import { tryCalculateEstimate } from "@/lib/domain/estimate-engine";
import { parseNumericInput } from "@/lib/domain/numeric-input";
import { formatMoney } from "@/lib/domain/pricing";

type Demo = {
  length: string; width: string; height: string;
  w1w: string; w1h: string; w2w: string; w2h: string;
  workers: string; wage: string; margin: number; zip: string;
  coats: number; coverage: number; waste: number;
};
const initial: Demo = { length:"",width:"",height:"",w1w:"",w1h:"",w2w:"",w2h:"",workers:"",wage:"",margin:45,zip:"",coats:2,coverage:400,waste:15 };
const num = (value: string) => {
  const result = parseNumericInput(value);
  return result.state === "valid" ? result.value : null;
};

export function ProductTour({ settingsMode=false }: { settingsMode?: boolean }) {
  const [step, setStep] = useState(() => {
    if (typeof window === "undefined") return 0;
    const saved = Number(localStorage.getItem("smartcoat.estimateTour.step"));
    return Number.isInteger(saved) && saved >= 0 && saved < 10 ? saved : 0;
  });
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  useEffect(() => localStorage.setItem("smartcoat.estimateTour.step", String(step)), [step]);
  const result = useMemo(() => {
    const values = [form.length,form.width,form.height,form.w1w,form.w1h,form.w2w,form.w2h,form.workers,form.wage].map(num);
    if (values.some(value => value === null)) return null;
    const calculation = tryCalculateEstimate({
      room:{lengthFeet:values[0]!,widthFeet:values[1]!,heightFeet:values[2]!},
      openings:[
        {kind:"window",widthFeet:values[3]!,heightFeet:values[4]!},
        {kind:"window",widthFeet:values[5]!,heightFeet:values[6]!},
      ],
      coats:form.coats,coverageSqFtPerGallon:form.coverage,wastePercent:form.waste,
      surfaceType:"smooth_previously_painted_drywall",
      containerSizeGallons:1,pricePerContainerCents:4798,
      productionRateSqFtPerHour:150,prepHours:2,crewSize:values[7]!,
      averageWageCentsPerHour:Math.round(values[8]!*100),laborBurdenPercent:20,
      overheadPercent:15,targetGrossMarginPercent:form.margin,productiveHoursPerDay:8,
      retailer:"manual_supplier",projectPostalCode:form.zip,pricingSource:"manual",
      pricingTimestamp:"2026-07-25T00:00:00.000Z",
    });
    return calculation.value;
  }, [form]);
  function patch<K extends keyof Demo>(key: K, value: Demo[K]) { setForm(current => ({...current,[key]:value})); setError(""); }
  function valid() {
    if (step===1 && ![form.length,form.width,form.height].every(value => (num(value)??0)>0)) return "Enter all three room dimensions.";
    if (step===2 && ![form.w1w,form.w1h,form.w2w,form.w2h].every(value => (num(value)??-1)>=0)) return "Enter both window dimensions.";
    if (step===4 && (num(form.workers)??0)<1) return "Choose at least one worker.";
    if (step===5 && (num(form.wage)??0)<=0) return "Enter an average hourly wage.";
    if (step===8 && !/^\d{5}$/.test(form.zip)) return "Enter a valid five-digit project ZIP code.";
    return "";
  }
  function next() { const message=valid(); if(message)return setError(message); setStep(current=>Math.min(9,current+1)); }
  function restart() { setForm(initial);setStep(0);setError("");localStorage.removeItem("smartcoat.estimateTour.step"); }
  function finish() { localStorage.setItem("smartcoat.productTour.completed",new Date().toISOString());location.assign(settingsMode?"/dashboard":"/subscribe"); }
  const screens = [
    <Panel key="welcome" title="Build one transparent room estimate." copy="SmartCoat calculates paint quantity, container cost, labor, crew duration, target margin, and a customer-ready price. This demo never creates production records."><div className="tour-hero"><Sparkles/><strong>Ten guided steps</strong><span>You enter the scope. Formula v3 explains every result.</span></div></Panel>,
    <Panel key="room" title="Enter the sample room." copy="Room perimeter × wall height gives gross wall surface area. Blank and partial numeric values are safe while editing."><div className="tour-form-grid"><Field label="Length (ft)" value={form.length} onChange={v=>patch("length",v)} placeholder="15"/><Field label="Width (ft)" value={form.width} onChange={v=>patch("width",v)} placeholder="12"/><Field label="Wall height (ft)" value={form.height} onChange={v=>patch("height",v)} placeholder="8"/></div></Panel>,
    <Panel key="openings" title="Subtract two windows." copy="Openings are removed from paintable wall area."><div className="tour-form-grid"><Field label="Window 1 width" value={form.w1w} onChange={v=>patch("w1w",v)} placeholder="3"/><Field label="Window 1 height" value={form.w1h} onChange={v=>patch("w1h",v)} placeholder="4"/><Field label="Window 2 width" value={form.w2w} onChange={v=>patch("w2w",v)} placeholder="4"/><Field label="Window 2 height" value={form.w2h} onChange={v=>patch("w2h",v)} placeholder="5"/></div><div className="tour-equation"><span>{result?.grossSurfaceAreaSqFt??"—"} ft²<small>gross wall</small></span><b>−</b><span>{result?.deductedOpeningAreaSqFt??"—"} ft²<small>windows</small></span><b>=</b><span className="accent">{result?.netPaintableAreaSqFt??"—"} ft²<small>paintable</small></span></div></Panel>,
    <Panel key="paint" title="Specify the paint system." copy="A color code identifies color only. Product, sheen, coverage rate, coats, container, and price must be confirmed separately."><div className="paint-card"><div className="swatch"/><div><strong>Behr · DC-001</strong><span>Whipped Cream · verified color</span><span>400 ft²/gal · 2 coats</span><span>Product and sheen not assumed</span></div></div></Panel>,
    <Panel key="crew" title="Choose the crew size." copy="Crew size changes elapsed duration, not total person-hours."><Field label="Number of workers" value={form.workers} onChange={v=>patch("workers",v)} placeholder="2"/></Panel>,
    <Panel key="wage" title="Enter average worker pay." copy="Average Hourly Wage is paid to one worker. Total wage cost equals total person-hours × average hourly wage; workers are not counted twice."><Field label="Average Hourly Wage per Worker ($)" value={form.wage} onChange={v=>patch("wage",v)} placeholder="25"/></Panel>,
    <Panel key="margin" title="Set a true target gross margin." copy="Customer price = contractor cost ÷ (1 − target margin). This is gross margin, not markup."><label className="block font-medium">Target gross margin <strong className="float-right text-brand">{form.margin}%</strong><input aria-label="Target gross margin percentage" className="mt-5 w-full accent-emerald-600" type="range" min="0" max="70" step="1" value={form.margin} onChange={event=>patch("margin",Number(event.target.value))}/></label></Panel>,
    <Panel key="supplier" title="Review supplier pricing." copy="Retailer prices require an exact authorized product listing. The tour uses a clearly labeled manual demonstration price—never a fabricated Home Depot or Lowe's price."><p className="tour-price">$47.98<small>manual demo price per 1-gallon container</small></p></Panel>,
    <Panel key="zip" title="Enter the project ZIP code." copy="ZIP identifies project location only. It does not change paint price, retailer, taxes, material cost, or total."><label className="block max-w-xs font-medium">Five-digit project ZIP code<input aria-describedby="zip-note" className="mt-2 min-h-12 w-full rounded-lg border border-border bg-white px-3 font-mono" inputMode="numeric" maxLength={5} value={form.zip} placeholder="33601" onChange={event=>patch("zip",event.target.value.replace(/\D/g,"").slice(0,5))}/></label><p id="zip-note" className="mt-3 text-sm text-muted">Location context only; excluded from formula v3.</p></Panel>,
    <Panel key="result" title="Your sample estimate is complete." copy="The same formula v3 engine powers the production estimate builder."><TourResult result={result} form={form}/><div className="mt-6 grid gap-3 sm:grid-cols-2"><Link href="/subscribe" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-brand px-5 font-semibold text-white">Subscribe to SmartCoat Premium</Link><button onClick={restart} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border font-semibold"><RotateCcw size={18}/>Restart Tour</button></div></Panel>,
  ];
  return <main className="tour-shell"><div className="tour-topbar"><Link href="/" className="tour-logo"><span>Smart</span>Coat</Link><button onClick={finish} className="tour-skip"><X size={16}/>Skip tour</button></div><div className="tour-progress"><span style={{width:`${((step+1)/10)*100}%`}}/></div><section className="tour-stage"><div className="tour-copy"><p className="tour-kicker">Interactive estimate · Step {step+1} of 10</p><h1>{step===0?"Welcome to SmartCoat":step===9?"Estimate generated":"Your inputs drive the math"}</h1><p className="tour-body">Demo mode is isolated from customer records, reporting, and analytics.</p></div><div className="tour-visual" key={step}>{screens[step]}{error&&<p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}</div></section><footer className="tour-controls"><button onClick={()=>setStep(current=>Math.max(0,current-1))} disabled={!step}><ArrowLeft size={18}/>Back</button><div>{screens.map((_,index)=><button aria-label={`Go to step ${index+1}`} key={index} onClick={()=>index<step&&setStep(index)} className={index===step?"current":""}/>)}</div>{step<9?<button className="primary" onClick={next}>{step===0?"Start Tour":"Continue"}<ArrowRight size={18}/></button>:<button className="primary" onClick={finish}>Done<Check size={18}/></button>}</footer></main>;
}

function Panel({title,copy,children}:{title:string;copy:string;children:React.ReactNode}) { return <div><h2 className="text-2xl font-semibold">{title}</h2><p className="mb-6 mt-2 leading-7 text-muted">{copy}</p>{children}</div>; }
function Field({label,value,onChange,placeholder}:{label:string;value:string;onChange:(value:string)=>void;placeholder:string}) { return <label className="block max-w-xs text-sm font-medium">{label}<input className="mt-2 min-h-12 w-full rounded-lg border border-border px-3 font-mono" type="text" inputMode="decimal" value={value} placeholder={placeholder} onChange={event=>onChange(event.target.value)}/></label>; }
function TourResult({result,form}:{result:ReturnType<typeof tryCalculateEstimate>["value"];form:Demo}) {
  if(!result)return <p role="alert" className="rounded-lg bg-amber-50 p-4">Complete the required inputs to generate the estimate.</p>;
  const wage=num(form.wage)??0;
  const rows=[["Gross wall area",`${result.grossSurfaceAreaSqFt} ft²`],["Net paintable area",`${result.netPaintableAreaSqFt} ft²`],["Raw paint required",`${result.rawGallonsRequired} gal`],["Containers purchased",`${result.purchaseQuantity} × ${result.containerSizeGallons} gal`],["Paint","Behr DC-001 · Whipped Cream"],["Price source","Manual demonstration price"],["Project ZIP",form.zip],["Material cost",formatMoney(result.materialSubtotalCents)],["Total person-hours",`${result.laborHours} hours`],["Average hourly wage",formatMoney(Math.round(wage*100))],["Crew duration",`${result.crewSize} workers · ${result.estimatedWorkingDays} days`],["Wages",formatMoney(result.wageCostCents)],["Total contractor cost",formatMoney(result.totalContractorCostCents)],["Customer estimate",formatMoney(result.customerEstimateCents)]];
  return <div className="summary">{rows.map(([label,value])=><p key={label}><span>{label}</span><strong>{value}</strong></p>)}</div>;
}
