"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { ESTIMATE_TUTORIAL_STEPS, PREP_HOURS_LABEL, type EstimateTutorialStep } from "@/lib/estimate-tutorial";

export const TUTORIAL_STEP_COPY: Record<EstimateTutorialStep, { title: string; body: string; target: string; action?: string }> = {
  estimate_name: { title: "Estimate Name", body: "Give the estimate a name so it can be easily identified. This temporary name will not be saved.", target: "estimate-name", action: "Fill Example" },
  number_of_workers: { title: "Number of Workers", body: "Enter how many workers are expected on the project. Crew size helps estimate duration; it does not multiply total person-hours.", target: "number-of-workers", action: "Use 2" },
  average_hourly_wage: { title: "Average Hourly Wage", body: "Enter the crew’s average hourly wage. This contributes to the labor-cost calculation.", target: "average-hourly-wage" },
  prep_hours_per_room: { title: PREP_HOURS_LABEL, body: "Enter the estimated preparation labor required for each room.", target: "prep-hours-per-room", action: "Use 2" },
  room_name: { title: "Room Name", body: "Name the room being estimated, such as Living Room or Primary Bedroom.", target: "room-name", action: "Fill Example" },
  length: { title: "Length", body: "Enter the room length.", target: "room-length", action: "Use 16 ft" },
  width: { title: "Width", body: "Enter the room width.", target: "room-width", action: "Use 14 ft" },
  wall_height: { title: "Wall Height", body: "Enter the wall height so SmartCoat can calculate wall surface area.", target: "wall-height", action: "Use 8 ft" },
  surface_type: { title: "Surface Type", body: "Choose the wall surface type. Different surfaces may require different amounts of paint.", target: "surface-type", action: "Use Smooth Drywall" },
  add_room: { title: "Add Room", body: "Add another temporary room to include it in this sample project estimate.", target: "add-room" },
  add_opening: { title: "Add Opening", body: "Add windows, doors, or other openings that should be deducted from paintable surface area.", target: "add-opening" },
  choose_paint: { title: "Choose Your Paint", body: "Select the paint brand and enter the paint color code for the project.", target: "choose-paint", action: "Fill Example" },
  gross_margin: { title: "Target Gross Margin", body: "Adjust gross margin to see the final customer estimate change after direct cost and project overhead.", target: "gross-margin", action: "Use 45%" },
  live_estimate_summary: { title: "Live Estimate Summary", body: "Watch the estimate update without saving. Paint uses surface area, coats, surface type, and waste; labor uses hours and wage; margin updates the final price.", target: "estimate-summary" },
};

export function EstimateTutorialCoach({ step, canContinue, error, onContinue, onBack, onFill, onExit }: {
  step: EstimateTutorialStep;
  canContinue: boolean;
  error: string;
  onContinue(): void;
  onBack(): void;
  onFill(): void;
  onExit(): void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const index = ESTIMATE_TUTORIAL_STEPS.indexOf(step);
  const content = TUTORIAL_STEP_COPY[step];

  useEffect(() => {
    const target = document.querySelector<HTMLElement>(`[data-tutorial-id="${content.target}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.setAttribute("data-tutorial-active", "true");
    heading.current?.focus();
    return () => target?.removeAttribute("data-tutorial-active");
  }, [content.target, step]);

  useEffect(() => {
    const exit = (event: KeyboardEvent) => { if (event.key === "Escape") onExit(); };
    window.addEventListener("keydown", exit);
    return () => window.removeEventListener("keydown", exit);
  }, [onExit]);

  const actionRequired = step === "add_room" || step === "add_opening";
  return <aside role="dialog" aria-modal="false" aria-labelledby="tutorial-step-title" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-emerald-200 bg-white p-5 shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6">
    <button aria-label="Exit tutorial" onClick={onExit} className="absolute right-4 top-4 rounded-md p-1 text-muted"><X size={18}/></button>
    <p aria-live="polite" className="text-xs font-bold uppercase tracking-widest text-brand">Step {index + 4} of 17</p>
    <h2 ref={heading} tabIndex={-1} id="tutorial-step-title" className="mt-2 text-xl font-semibold outline-none">{content.title}</h2>
    <p className="mt-2 text-sm leading-6 text-muted">{content.body}</p>
    {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      {index > 0 && <button onClick={onBack} className="min-h-11 rounded-lg border border-border px-4 font-semibold">Back</button>}
      {content.action && <button onClick={onFill} className="min-h-11 rounded-lg border border-brand px-4 font-semibold text-brand">{content.action}</button>}
      {!actionRequired && <button disabled={!canContinue} onClick={onContinue} className="min-h-11 rounded-lg bg-brand px-4 font-semibold text-white disabled:opacity-40">{step === "live_estimate_summary" ? "Complete Tutorial" : "Next"}</button>}
      <button onClick={onExit} className="min-h-11 px-3 text-sm font-semibold text-muted">Exit Tutorial</button>
    </div>
  </aside>;
}
