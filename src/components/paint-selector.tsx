"use client";

import { useEffect, useId, useState } from "react";
import type { EstimatePaintSelection, PaintSearchResult } from "@/lib/domain/paint-catalog";

export function PaintSelector({
  brands, value, onChange,
}: {
  brands: { id: string; name: string }[];
  value: EstimatePaintSelection;
  onChange: (selection: EstimatePaintSelection) => void;
}) {
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [brandId, setBrandId] = useState("");
  const [scope, setScope] = useState<"interior" | "exterior">("interior");
  const [results, setResults] = useState<PaintSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectionLabel, setSelectionLabel] = useState("");
  const [message, setMessage] = useState("Type at least two characters to search the verified catalog.");

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || query === selectionLabel) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({ q: trimmed, scope });
      if (brandId) params.set("brandId", brandId);
      setLoading(true);
      setOpen(true);
      try {
        const response = await fetch(`/api/paint-catalog/search?${params}`, { signal: controller.signal });
        const body = (await response.json()) as { results?: PaintSearchResult[]; error?: string };
        const nextResults = body.results ?? [];
        setResults(nextResults);
        setActiveIndex(nextResults.length ? 0 : -1);
        setMessage(body.error ?? (nextResults.length
          ? `${nextResults.length} verified match${nextResults.length === 1 ? "" : "es"}.`
          : "No verified catalog match. Use manual entry without adding it to the global catalog."));
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("[paint-autocomplete] search failed", { message: String(error) });
          setResults([]);
          setMessage("Catalog search could not be completed.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [brandId, query, scope, selectionLabel]);

  function selectResult(result: PaintSearchResult) {
    const label = `${result.color_code} — ${result.color_name}`;
    onChange({
      ...value,
      paintColorId: result.color_id,
      brandName: result.brand_name,
      colorName: result.color_name,
      colorCode: result.color_code,
      projectUse: scope,
      isManualEntry: false,
    });
    setQuery(label);
    setSelectionLabel(label);
    setOpen(false);
    setResults([]);
    setMessage(`${result.brand_name} ${result.color_code} selected. Confirm product, sheen, container, and price below.`);
  }

  function manualField(
    field: "brandName" | "colorName" | "colorCode" | "productName" | "productType" | "sheen" | "retailerName" | "notes",
    next: string,
  ) {
    onChange({ ...value, paintColorId: null, isManualEntry: true, [field]: next || null });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") { setOpen(false); return; }
    if (!open || !results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(index => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(index => (index <= 0 ? results.length - 1 : index - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      selectResult(results[activeIndex]);
    }
  }

  return <section className="space-y-4 rounded-lg border border-border bg-background p-4">
    <div><h3 className="font-semibold">Paint selection</h3><p aria-live="polite" className="text-sm text-muted">{loading ? "Searching verified paint codes…" : message}</p></div>
    <div className="grid gap-3 sm:grid-cols-[1fr_220px_150px]">
      <div className="relative">
        <label htmlFor={`${listboxId}-input`} className="text-sm font-medium">Color code or name</label>
        <input
          id={`${listboxId}-input`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          value={query}
          onKeyDown={handleKeyDown}
          onChange={event => {
            setQuery(event.target.value);
            setSelectionLabel("");
            if (event.target.value.trim().length < 2) {
              setResults([]);
              setOpen(false);
              setMessage("Type at least two characters to search the verified catalog.");
            }
          }}
          placeholder="e.g. DC-001"
          className="mt-1 min-h-11 w-full rounded-lg border border-border px-3 font-mono"
        />
        {open && <div id={listboxId} role="listbox" aria-label="Paint matches" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-surface p-1 shadow-xl">
          {loading && <p className="p-3 text-sm text-muted">Searching…</p>}
          {!loading && results.length === 0 && <p className="p-3 text-sm text-muted">No verified matches.</p>}
          {!loading && results.map((result, index) =>
            <button
              id={`${listboxId}-${index}`}
              key={result.color_id}
              role="option"
              aria-selected={index === activeIndex}
              type="button"
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectResult(result)}
              className={`flex min-h-14 w-full items-center gap-3 rounded-md px-3 text-left ${index === activeIndex ? "bg-background" : ""}`}
            >
              <span className="h-8 w-8 shrink-0 rounded border border-black/10" style={{ backgroundColor: result.hex_value ?? "#e5e7eb" }} aria-label="Approximate digital swatch"/>
              <span className="flex-1"><span className="block font-medium">{result.brand_name} · {result.color_name}</span><span className="font-mono text-xs text-muted">{result.color_code} · {result.matched_by.replace("_", " ")}</span></span>
              {result.is_discontinued && <span className="text-xs font-semibold text-amber-700">Discontinued</span>}
            </button>)}
        </div>}
      </div>
      <label className="text-sm font-medium">Brand filter<select value={brandId} onChange={event => setBrandId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"><option value="">All brands</option>{brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
      <label className="text-sm font-medium">Project use<select value={scope} onChange={event => { const next=event.target.value as "interior"|"exterior"; setScope(next); onChange({...value,projectUse:next}); }} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"><option value="interior">Interior</option><option value="exterior">Exterior</option></select></label>
    </div>
    <p className="text-xs text-muted">On-screen color is an approximation, not a guaranteed physical paint match. A color does not determine product, sheen, container, or price.</p>
    <details open={value.isManualEntry || Boolean(value.paintColorId)}>
      <summary className="cursor-pointer text-sm font-semibold">Product and supplier details</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([
          ["Manufacturer or supplier", "brandName"],
          ["Color name", "colorName"],
          ["Color code", "colorCode"],
          ["Product line", "productName"],
          ["Product type", "productType"],
          ["Sheen", "sheen"],
          ["Retailer or supplier", "retailerName"],
        ] as const).map(([label, field]) => <label key={field} className="text-sm font-medium">{label}<input value={value[field] ?? ""} onChange={event => manualField(field, event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"/></label>)}
        <label className="text-sm font-medium sm:col-span-2 lg:col-span-4">Notes<textarea value={value.notes ?? ""} onChange={event => manualField("notes", event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-border p-3"/></label>
      </div>
    </details>
  </section>;
}
