import { describe, expect, it } from "vitest";
import { calculateEstimate, tryCalculateEstimate, type EstimateEngineInput } from "./estimate-engine";

const base: EstimateEngineInput = {
  room:{lengthFeet:15,widthFeet:12,heightFeet:8},
  openings:[{kind:"window",widthFeet:3,heightFeet:4},{kind:"window",widthFeet:4,heightFeet:5}],
  coats:2,coverageSqFtPerGallon:400,wastePercent:10,
  containerSizeGallons:1,pricePerContainerCents:4798,
  productionRateSqFtPerHour:150,prepHours:2,crewSize:2,
  averageWageCentsPerHour:2500,laborBurdenPercent:20,overheadPercent:10,
  targetGrossMarginPercent:45,productiveHoursPerDay:8,retailer:"manual_supplier",
  projectPostalCode:"33601",pricingSource:"manual",pricingTimestamp:"2026-07-25T00:00:00.000Z",
};

describe("central estimate engine v3", () => {
  it("calculates container purchases and true gross margin", () => {
    const result=calculateEstimate(base);
    expect(result.formulaVersion).toBe("3.0.0");
    expect(result.grossSurfaceAreaSqFt).toBe(432);
    expect(result.netPaintableAreaSqFt).toBe(400);
    expect(result.rawGallonsRequired).toBe(2.2);
    expect(result.containersRequired).toBe(3);
    expect(result.purchaseQuantity).toBe(3);
    expect(result.gallonsPurchased).toBe(3);
    expect(result.excessGallons).toBe(0.8);
    expect(result.paintCostCents).toBe(14394);
    expect(result.expectedGrossMarginPercent).toBe(45);
  });

  it("does not double-count workers in wage cost", () => {
    const twoWorkers=calculateEstimate(base);
    const fourWorkers=calculateEstimate({...base,crewSize:4});
    expect(fourWorkers.wageCostCents).toBe(twoWorkers.wageCostCents);
    expect(fourWorkers.laborHours).toBe(twoWorkers.laborHours);
    expect(fourWorkers.estimatedElapsedHours).toBeCloseTo(twoWorkers.laborHours/4,2);
  });

  it("keeps ZIP code out of every calculated price", () => {
    const first=calculateEstimate({...base,projectPostalCode:"33601"});
    const second=calculateEstimate({...base,projectPostalCode:"90210"});
    expect(second.customerEstimateCents).toBe(first.customerEstimateCents);
    expect(second.materialSubtotalCents).toBe(first.materialSubtotalCents);
    expect(second.taxCents).toBe(first.taxCents);
  });

  it("rounds containers upward and prevents an under-purchase", () => {
    const result=calculateEstimate({...base,containerSizeGallons:1,containerQuantity:1});
    expect(result.purchaseQuantity).toBe(3);
    expect(result.warnings.join(" ")).toMatch(/increased/i);
  });

  it("returns structured validation errors for UI callers", () => {
    const result=tryCalculateEstimate({...base,coverageSqFtPerGallon:0});
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toMatch(/coverage/i);
  });

  it("rejects invalid crew, coverage, container, price, and margin", () => {
    expect(()=>calculateEstimate({...base,crewSize:0})).toThrow();
    expect(()=>calculateEstimate({...base,coverageSqFtPerGallon:0})).toThrow();
    expect(()=>calculateEstimate({...base,containerSizeGallons:0})).toThrow();
    expect(()=>calculateEstimate({...base,pricePerContainerCents:-1})).toThrow();
    expect(()=>calculateEstimate({...base,targetGrossMarginPercent:100})).toThrow();
  });

  it("caps excessive openings and returns a warning", () => {
    const result=calculateEstimate({...base,openings:[{kind:"other",widthFeet:100,heightFeet:100}]});
    expect(result.netPaintableAreaSqFt).toBe(0);
    expect(result.warnings[0]).toMatch(/exceeds/);
  });
});
