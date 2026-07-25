"use client";

import { useEffect, useState } from "react";
import type { EstimatePaintSelection, PaintSearchResult } from "@/lib/domain/paint-catalog";

export function PaintSelector({
  brands, value, onChange,
}: {
  brands: { id: string; name: string }[];
  value: EstimatePaintSelection;
  onChange: (selection: EstimatePaintSelection) => void;
}) {
  const [query, setQuery] = useState("");
  const [brandId, setBrandId] = useState("");
  const [scope, setScope] = useState<"interior" | "exterior">("interior");
  const [results, setResults] = useState<PaintSearchResult[]>([]);
  const [message, setMessage] = useState("Search by manufacturer color code first, or enter a manual color below.");

  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({ q: query.trim(), scope });
      if (brandId) params.set("brandId", brandId);
      try {
        const response = await fetch(`/api/paint-catalog/search?${params}`, { signal: controller.signal });
        const body = (await response.json()) as { results?: PaintSearchResult[]; error?: string };
        setResults(body.results ?? []);
        setMessage(body.error ?? (body.results?.length
          ? "Choose a color. Product line, sheen, coverage, and price remain separate choices."
          : "No authorized catalog match. You can preserve this as a manual estimate entry."));
      } catch (error) {
        if ((error as Error).name !== "AbortError") setMessage("Catalog search could not be completed.");
      }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [brandId, query, scope]);

  function selectResult(result: PaintSearchResult) {
    onChange({ ...value, paintColorId: result.color_id, brandName: result.brand_name, colorName: result.color_name, colorCode: result.color_code });
    setResults([]);
    setQuery(`${result.color_code} — ${result.color_name}`);
  }

  function manualField(field: "brandName" | "colorName" | "colorCode" | "productName" | "sheen", next: string) {
    onChange({ ...value, paintColorId: null, [field]: next || null });
  }

  return <section className="space-y-4 rounded-lg border border-border bg-background p-4">
    <div><h3 className="font-semibold">Paint selection</h3><p className="text-sm text-muted">{message}</p></div>
    <div className="grid gap-3 sm:grid-cols-[1fr_220px_150px]">
      <label className="text-sm font-medium">Color code or name<input value={query} onChange={event=>{setQuery(event.target.value);if(event.target.value.trim().length<2)setResults([]);}} placeholder="e.g. N430-6A" className="mt-1 min-h-11 w-full rounded-lg border border-border px-3 font-mono"/></label>
      <label className="text-sm font-medium">Brand filter<select value={brandId} onChange={event=>setBrandId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"><option value="">All brands</option>{brands.map(brand=><option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
      <label className="text-sm font-medium">Project use<select value={scope} onChange={event=>setScope(event.target.value as "interior"|"exterior")} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"><option value="interior">Interior</option><option value="exterior">Exterior</option></select></label>
    </div>
    {results.length>0&&<div className="grid gap-2" role="listbox" aria-label="Paint matches">{results.map(result=><button key={result.color_id} type="button" onClick={()=>selectResult(result)} className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-surface px-3 text-left hover:border-brand"><span className="h-8 w-8 shrink-0 rounded border border-black/10" style={{backgroundColor:result.hex_value??"#e5e7eb"}} aria-label="Approximate digital swatch"/><span className="flex-1"><span className="block font-medium">{result.brand_name} · {result.color_name}</span><span className="font-mono text-xs text-muted">{result.color_code} · {result.matched_by.replace("_"," ")}</span></span>{result.is_discontinued&&<span className="text-xs font-semibold text-amber-700">Discontinued</span>}</button>)}</div>}
    <p className="text-xs text-muted">On-screen color is an approximation and is not a guaranteed physical paint match.</p>
    <details><summary className="cursor-pointer text-sm font-semibold">Manual entry or product details</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{([["Brand","brandName"],["Color name","colorName"],["Color code","colorCode"],["Product line","productName"],["Sheen","sheen"]] as const).map(([label,field])=><label key={field} className="text-sm font-medium">{label}<input value={value[field]??""} onChange={event=>manualField(field,event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"/></label>)}</div></details>
  </section>;
}
