export const ESTIMATE_TUTORIAL_VERSION = 1;
export const PREP_HOURS_LABEL = "Prep Hours per Room";

export const ESTIMATE_TUTORIAL_STEPS = [
  "estimate_name",
  "number_of_workers",
  "average_hourly_wage",
  "prep_hours_per_room",
  "room_name",
  "length",
  "width",
  "wall_height",
  "surface_type",
  "add_room",
  "add_opening",
  "choose_paint",
  "gross_margin",
  "live_estimate_summary",
] as const;

export type EstimateTutorialStep = typeof ESTIMATE_TUTORIAL_STEPS[number];
export type EstimateMode = "create" | "edit" | "tutorial";
export type DashboardTutorialState = "idle" | "introduction" | "new_estimate";
export type TutorialPlan = "free" | "trial" | "premium" | "enterprise";

export const TUTORIAL_SAMPLE = {
  estimateName: "Tutorial Estimate",
  firstRoom: {
    name: "Living Room", length: "16", width: "14", height: "8",
    surfaceType: "smooth_previously_painted_drywall",
    coats: "2", paintBrand: "Behr", paintColorCode: "N430-6A",
    pricePerContainerDollars: "47.98",
  },
  opening: {
    name: "Front Window", width: "6", height: "4", quantity: "1",
    subtractFromPaintableArea: true,
  },
  secondRoom: {
    name: "Primary Bedroom", length: "14", width: "12", height: "8",
    surfaceType: "light_orange_peel",
    coats: "2", paintBrand: "Sherwin-Williams", paintColorCode: "SW 7005",
    pricePerContainerDollars: "52.49",
  },
  labor: { workers: "2", prepHours: "2" },
  grossMargin: "45",
} as const;

export function tutorialPlanFromStatus(status?: string | null): TutorialPlan {
  if (status === "trialing") return "trial";
  if (status === "active" || status === "lifetime") return "premium";
  return "free";
}

export function isPaidTutorialPlan(plan: TutorialPlan) {
  return plan === "premium" || plan === "enterprise";
}

export function nextTutorialStep(step: EstimateTutorialStep) {
  const index = ESTIMATE_TUTORIAL_STEPS.indexOf(step);
  return index < ESTIMATE_TUTORIAL_STEPS.length - 1 ? ESTIMATE_TUTORIAL_STEPS[index + 1] : null;
}

export function canPersistEstimate(mode: EstimateMode) {
  return mode !== "tutorial";
}

export function dashboardTutorialTransition(state: DashboardTutorialState, event: "start" | "begin" | "cancel"): DashboardTutorialState {
  if (event === "start") return "introduction";
  if (event === "begin" && state === "introduction") return "new_estimate";
  if (event === "cancel") return "idle";
  return state;
}

export function trackTutorialEvent(name: string, detail: Record<string, string | number | boolean> = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("smartcoat:analytics", {
    detail: { name, ...detail },
  }));
}
