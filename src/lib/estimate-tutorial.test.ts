import { describe, expect, it } from "vitest";
import { calculateMultiRoomEstimate } from "@/lib/domain/multi-room-estimate";
import { ESTIMATION_ASSUMPTIONS } from "@/lib/domain/estimation-config";
import {
  ESTIMATE_TUTORIAL_STEPS,
  PREP_HOURS_LABEL,
  TUTORIAL_SAMPLE,
  canPersistEstimate,
  dashboardTutorialTransition,
  isPaidTutorialPlan,
  nextTutorialStep,
  tutorialPlanFromStatus,
} from "@/lib/estimate-tutorial";

const room = (id: string, name: string, lengthFeet: number, widthFeet: number, surfaceType: "smooth_previously_painted_drywall" | "light_orange_peel", openings: { widthFeet: number; heightFeet: number; quantity: number; subtractFromPaintableArea: boolean; kind: "window" }[] = []) => ({
  id, name, lengthFeet, widthFeet, heightFeet: 8, surfaceType, openings,
  coats: 2, wastePercent: ESTIMATION_ASSUMPTIONS.paintWastePercent,
  containerSizeGallons: 1, pricePerContainerCents: 4798, crewSize: 2,
  averageWageCentsPerHour: 2500, prepPersonHours: 2,
  retailer: "manual_supplier" as const, pricingSource: "manual" as const,
  pricingTimestamp: "2026-07-26T00:00:00.000Z",
});

describe("estimate tutorial workflow", () => {
  it("uses the required real-estimate step order", () => {
    expect(ESTIMATE_TUTORIAL_STEPS).toEqual([
      "estimate_name", "number_of_workers", "average_hourly_wage",
      "prep_hours_per_room", "room_name", "length", "width", "wall_height",
      "surface_type", "add_room", "add_opening", "choose_paint",
      "gross_margin", "live_estimate_summary",
    ]);
    expect(nextTutorialStep("add_room")).toBe("add_opening");
    expect(nextTutorialStep("live_estimate_summary")).toBeNull();
  });

  it("uses the requested realistic sample data", () => {
    expect(TUTORIAL_SAMPLE.estimateName).toBe("Tutorial Estimate");
    expect(TUTORIAL_SAMPLE.firstRoom.paintColorCode).toBe("N430-6A");
    expect(TUTORIAL_SAMPLE.secondRoom.paintColorCode).toBe("SW 7005");
    expect(TUTORIAL_SAMPLE.opening.subtractFromPaintableArea).toBe(true);
  });

  it("never permits tutorial estimate persistence", () => {
    expect(canPersistEstimate("tutorial")).toBe(false);
    expect(canPersistEstimate("create")).toBe(true);
    expect(canPersistEstimate("edit")).toBe(true);
  });

  it("starts immediately in memory without a reload", () => {
    expect(dashboardTutorialTransition("idle", "start")).toBe("introduction");
    expect(dashboardTutorialTransition("introduction", "begin")).toBe("new_estimate");
    expect(dashboardTutorialTransition("new_estimate", "cancel")).toBe("idle");
  });

  it("uses the renamed prep-hours label", () => {
    expect(PREP_HOURS_LABEL).toBe("Prep Hours per Room");
    expect(PREP_HOURS_LABEL).not.toContain("Person-Hours");
  });

  it("deducts the tutorial opening and calculates both rooms with the real engine", () => {
    const withoutOpening = calculateMultiRoomEstimate([room("living", "Living Room", 16, 14, "smooth_previously_painted_drywall")], 45, 15);
    const result = calculateMultiRoomEstimate([
      room("living", "Living Room", 16, 14, "smooth_previously_painted_drywall", [{ kind: "window", widthFeet: 6, heightFeet: 4, quantity: 1, subtractFromPaintableArea: true }]),
      room("bedroom", "Primary Bedroom", 14, 12, "light_orange_peel"),
    ], 45, 15);
    expect(withoutOpening.totals.netPaintableAreaSqFt - result.rooms[0].netPaintableAreaSqFt).toBe(24);
    expect(result.rooms).toHaveLength(2);
    expect(result.totals.customerEstimateCents).toBeGreaterThan(result.totals.contractorCostCents);
  });

  it("keeps gross margin separate from paint, labor, and direct cost", () => {
    const rooms = [room("living", "Living Room", 16, 14, "smooth_previously_painted_drywall")];
    const low = calculateMultiRoomEstimate(rooms, 35, 15);
    const high = calculateMultiRoomEstimate(rooms, 50, 15);
    expect(high.totals.customerEstimateCents).toBeGreaterThan(low.totals.customerEstimateCents);
    expect(high.totals.expectedGrossProfitCents).toBeGreaterThan(low.totals.expectedGrossProfitCents);
    expect(high.totals.rawGallonsRequired).toBe(low.totals.rawGallonsRequired);
    expect(high.totals.laborPersonHours).toBe(low.totals.laborPersonHours);
    expect(high.totals.directCostCents).toBe(low.totals.directCostCents);
  });

  it("maps trusted entitlement states without treating a client flag as authority", () => {
    expect(tutorialPlanFromStatus(null)).toBe("free");
    expect(tutorialPlanFromStatus("trialing")).toBe("trial");
    expect(tutorialPlanFromStatus("active")).toBe("premium");
    expect(tutorialPlanFromStatus("lifetime")).toBe("premium");
    expect(isPaidTutorialPlan("premium")).toBe(true);
    expect(isPaidTutorialPlan("free")).toBe(false);
  });
});
