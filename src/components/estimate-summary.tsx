"use client";

import { formatMoney } from "@/lib/domain/pricing";
import type { calculateMultiRoomEstimate } from "@/lib/domain/multi-room-estimate";

type EstimateResult = ReturnType<typeof calculateMultiRoomEstimate>;

export function EstimateSummary({ result, targetMargin }: {
  result: EstimateResult | null;
  targetMargin: string;
}) {
  return <section aria-labelledby="estimate-summary-title" className="rounded-xl bg-[#16251d] p-5 text-white">
    <h2 id="estimate-summary-title" className="text-xl font-semibold">Estimate Summary</h2>
    {!result ? <p className="mt-3 text-sm text-emerald-100/70">Complete the room information to see the live estimate.</p> : <>
      <p className="mt-5 text-xs uppercase tracking-wide text-emerald-100/70">Final Customer Estimate</p>
      <p aria-live="polite" className="mt-1 font-mono text-3xl font-semibold">{formatMoney(result.totals.customerEstimateCents)}</p>
      <dl className="mt-5 space-y-3 text-sm">
        <SummaryRow label="Rooms Included" value={String(result.rooms.length)}/>
        <SummaryRow label="Paintable Area" value={`${result.totals.netPaintableAreaSqFt.toFixed(1)} ft²`}/>
        <SummaryRow label="Raw Paint Required" value={`${result.totals.rawGallonsRequired.toFixed(2)} gal`}/>
        <SummaryRow label="Purchased Paint" value={`${result.totals.gallonsPurchased.toFixed(2)} gal`}/>
        <SummaryRow label="Paint Cost" value={formatMoney(result.totals.paintCostCents)}/>
        <SummaryRow label="Labor Person-Hours" value={result.totals.laborPersonHours.toFixed(2)}/>
        <SummaryRow label="Loaded Labor Cost" value={formatMoney(result.totals.loadedLaborCostCents)}/>
        <SummaryRow label="Project Direct Cost" value={formatMoney(result.totals.directCostCents)}/>
        <SummaryRow label="Overhead" value={formatMoney(result.totals.overheadCents)}/>
        <SummaryRow label="Total Internal Cost" value={formatMoney(result.totals.contractorCostCents)}/>
        <SummaryRow label="Target Gross Margin" value={`${targetMargin}%`}/>
        <SummaryRow label="Expected Gross Profit" value={formatMoney(result.totals.expectedGrossProfitCents)}/>
      </dl>
      <div className="mt-5 border-t border-white/10 pt-4">
        <h3 className="text-sm font-semibold">Paint Containers</h3>
        <ul className="mt-2 space-y-1 text-sm text-emerald-100/80">
          {result.rooms.map(room=><li key={room.roomId}>
            {room.roomName}: {room.containers.map(container=>
              `${container.quantity} × ${container.containerSizeGallons}-gal`
            ).join(", ")}
          </li>)}
        </ul>
      </div>
    </>}
  </section>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-2">
    <dt className="text-emerald-100/70">{label}</dt>
    <dd className="text-right font-mono">{value}</dd>
  </div>;
}
