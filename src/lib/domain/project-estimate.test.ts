import { describe, expect, it } from "vitest";
import { calculateProjectEstimate } from "./project-estimate";

describe("project-level estimate pricing",()=>{
  it("aggregates room direct costs before overhead and margin",()=>{
    expect(calculateProjectEstimate({
      rooms:[{roomId:"one",directCostCents:50000},{roomId:"two",directCostCents:70000}],
      targetGrossMarginPercent:30,
    })).toEqual({
      roomDirectCostTotalCents:120000,
      projectLevelDirectMaterialsCents:0,
      adjustedProjectDirectCostCents:120000,
      overheadCents:18000,
      totalInternalCostCents:138000,
      finalCustomerEstimateCents:197143,
      expectedGrossProfitCents:59143,
    });
  });
  it("removing a room lowers every downstream project total",()=>{
    const two=calculateProjectEstimate({rooms:[{roomId:"one",directCostCents:50000},{roomId:"two",directCostCents:70000}],targetGrossMarginPercent:30});
    const one=calculateProjectEstimate({rooms:[{roomId:"one",directCostCents:50000}],targetGrossMarginPercent:30});
    expect(one.adjustedProjectDirectCostCents).toBeLessThan(two.adjustedProjectDirectCostCents);
    expect(one.overheadCents).toBeLessThan(two.overheadCents);
    expect(one.totalInternalCostCents).toBeLessThan(two.totalInternalCostCents);
    expect(one.finalCustomerEstimateCents).toBeLessThan(two.finalCustomerEstimateCents);
    expect(one.expectedGrossProfitCents).toBeLessThan(two.expectedGrossProfitCents);
  });
  it("changing margin changes pricing but not costs",()=>{
    const low=calculateProjectEstimate({rooms:[{roomId:"one",directCostCents:100000}],targetGrossMarginPercent:20});
    const high=calculateProjectEstimate({rooms:[{roomId:"one",directCostCents:100000}],targetGrossMarginPercent:40});
    expect(high.adjustedProjectDirectCostCents).toBe(low.adjustedProjectDirectCostCents);
    expect(high.totalInternalCostCents).toBe(low.totalInternalCostCents);
    expect(high.finalCustomerEstimateCents).toBeGreaterThan(low.finalCustomerEstimateCents);
  });
});
