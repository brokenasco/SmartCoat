"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { ESTIMATE_TUTORIAL_STEPS, type EstimateTutorialStep } from "@/lib/estimate-tutorial";

const COPY: Record<EstimateTutorialStep, { title: string; body: string; target: string; action?: string }> = {
  estimate_name: { title: "Name the estimate", body: "Give the project a clear name so it is easy to find later.", target: "estimate-name", action: "Fill Example" },
  room_name: { title: "Name the first room", body: "Start with the Living Room.", target: "room-name", action: "Fill Example" },
  room_dimensions: { title: "Enter room dimensions", body: "SmartCoat uses length, width, and wall height to calculate gross wall area.", target: "room-dimensions", action: "Fill Example" },
  add_opening: { title: "Add an opening", body: "Select Add Opening to subtract a window, door, or other opening.", target: "add-opening" },
  opening_details: { title: "Describe the window", body: "Enter the opening dimensions and keep Subtract from Paintable Area selected.", target: "opening-details", action: "Fill Example" },
  surface_type: { title: "Choose the surface", body: "Surface texture changes effective paint coverage.", target: "surface-type", action: "Fill Example" },
  paint_details: { title: "Add paint details", body: "Coats, brand, color, and container price drive the real material calculation.", target: "paint-details", action: "Fill Example" },
  labor_setup: { title: "Review shared labor", body: "These settings apply to every room. The wage starts with your company default.", target: "labor-setup", action: "Use Example" },
  room_summary: { title: "Watch the live estimate", body: "The opening is deducted and the real calculation engine updates paint, labor, overhead, and price.", target: "estimate-summary" },
  add_second_room: { title: "Add another room", body: "Select Add Room. Shared labor settings will be inherited automatically.", target: "add-room" },
  second_room_details: { title: "Complete the bedroom", body: "Use the sample to reinforce the same real room workflow.", target: "room-dimensions", action: "Fill Example" },
  gross_margin: { title: "Set gross margin", body: "Gross margin changes selling price and expected profit, not gallons, hours, or direct cost.", target: "gross-margin", action: "Use 45%" },
  final_estimate: { title: "Your Final Estimate", body: "SmartCoat combines both rooms, applies overhead, then applies gross margin to produce the customer estimate.", target: "estimate-summary" },
  save_or_approve: { title: "Finish the workflow", body: "Choose Save as Draft for later review or Approve Estimate when pricing is final. Nothing is saved unless you explicitly keep it.", target: "save-or-approve" },
};

export function EstimateTutorialCoach({ step, canContinue, error, onContinue, onFill, onExit }: {
  step: EstimateTutorialStep;
  canContinue: boolean;
  error: string;
  onContinue(): void;
  onFill(): void;
  onExit(): void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const index = ESTIMATE_TUTORIAL_STEPS.indexOf(step);
  const content = COPY[step];

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

  return <aside role="dialog" aria-modal="false" aria-labelledby="tutorial-step-title" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-emerald-200 bg-white p-5 shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6">
    <button aria-label="Exit tutorial" onClick={onExit} className="absolute right-4 top-4 rounded-md p-1 text-muted"><X size={18}/></button>
    <p aria-live="polite" className="text-xs font-bold uppercase tracking-widest text-brand">Step {index + 3} of 16</p>
    <h2 ref={heading} tabIndex={-1} id="tutorial-step-title" className="mt-2 text-xl font-semibold outline-none">{content.title}</h2>
    <p className="mt-2 text-sm leading-6 text-muted">{content.body}</p>
    {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      {content.action && <button onClick={onFill} className="min-h-11 rounded-lg border border-brand px-4 font-semibold text-brand">{content.action}</button>}
      {!["add_opening", "add_second_room", "save_or_approve"].includes(step) && <button disabled={!canContinue} onClick={onContinue} className="min-h-11 rounded-lg bg-brand px-4 font-semibold text-white disabled:opacity-40">Continue</button>}
      <button onClick={onExit} className="min-h-11 px-3 text-sm font-semibold text-muted">Exit Tutorial</button>
    </div>
  </aside>;
}
