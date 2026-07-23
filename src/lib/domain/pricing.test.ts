import { describe, expect, it } from "vitest";
import { calculatePricing } from "./pricing";

describe("pricing engine", () => {
  it("distinguishes margin and markup with decimal-safe cents", () => expect(calculatePricing({ laborCostCents: 100000, materialCostCents: 25000, overheadPercent: 10, targetMarginPercent: 45, taxPercent: 6, depositPercent: 25 })).toEqual({ directCostCents: 125000, overheadCents: 12500, totalCostCents: 137500, subtotalCents: 250000, grossProfitCents: 112500, grossMarginPercent: 45, taxCents: 15000, totalCents: 265000, depositCents: 66250, balanceCents: 198750 }));
  it("applies discounts before tax", () => expect(calculatePricing({ laborCostCents: 5000, materialCostCents: 5000, overheadPercent: 0, targetMarginPercent: 50, discountCents: 2000, taxPercent: 10 }).totalCents).toBe(19800));
  it("rejects impossible margins", () => expect(() => calculatePricing({ laborCostCents: 1, materialCostCents: 1, overheadPercent: 0, targetMarginPercent: 100 })).toThrow());
});
