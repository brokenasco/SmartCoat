import { describe, expect, it } from "vitest";
import { calculateProjectEstimate } from "./project-estimate";

describe("project-level estimate pricing",()=>{
  it("aggregates room direct costs before overhead and margin",()=>{
    expect(calculateProjectEstimate({
      rooms:[{roomId:"one",directCostCents:50000},{roomId:"two",directCostCents:70000}],
      targetGrossMarginPercent:30,
    })).toEqual({
      roomDirectCostTotalCents:120000,
      projectDirectCostCents:120000,
      overheadCents:18000,
      totalInternalCostCents:138000,
      finalCustomerEstimateCents:197143,
      expectedGrossProfitCents:59143,
    });
  });
  it("removing a room lowers every downstream project total",()=>{
    const two=calculateProjectEstimate({rooms:[{roomId:"one",directCostCents:50000},{roomId:"two",directCostCents:70000}],targetGrossMarginPercent:30});
    const one=calculateProjectEstimate({rooms:[{roomId:"one",directCostCents:50000}],targetGrossMarginPercent:30});
    expect(one.projectDirectCostCents).toBeLessThan(two.projectDirectCostCents);
    expect(one.overheadCents).toBeLessThan(two.overheadCents);
    expect(one.totalInternalCostCents).toBeLessThan(two.totalInternalCostCents);
    expect(one.finalCustomerEstimateCents).toBeLessThan(two.finalCustomerEstimateCents);
    expect(one.expectedGrossProfitCents).toBeLessThan(two.expectedGrossProfitCents);
  });
  it("changing margin changes pricing but not costs",()=>{
    const low=calculateProjectEstimate({rooms:[{roomId:"one",directCostCents:100000}],targetGrossMarginPercent:20});
    const high=calculateProjectEstimate({rooms:[{roomId:"one",directCostCents:100000}],targetGrossMarginPercent:40});
    expect(high.projectDirectCostCents).toBe(low.projectDirectCostCents);
    expect(high.totalInternalCostCents).toBe(low.totalInternalCostCents);
    expect(high.finalCustomerEstimateCents).toBeGreaterThan(low.finalCustomerEstimateCents);
  });
  it("uses paint plus loaded labor as the complete direct cost",()=>{
    const result=calculateProjectEstimate({
      rooms:[{roomId:"room",directCostCents:100000}],
      overheadPercent:15,
      targetGrossMarginPercent:40,
    });
    expect(result.projectDirectCostCents).toBe(100000);
    expect(result.overheadCents).toBe(15000);
    expect(result.totalInternalCostCents).toBe(115000);
    expect(result.finalCustomerEstimateCents).toBe(191667);
    expect(result.expectedGrossProfitCents).toBe(76667);
  });
});
