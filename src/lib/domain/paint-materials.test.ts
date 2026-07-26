import { describe, expect, it } from "vitest";
import { calculatePaintGallons } from "./paint-materials";
import { LEGACY_SURFACE_TYPE, SURFACE_TYPES } from "./surface-types";

const base = {
  netPaintableArea: 1000,
  numberOfCoats: 2,
  productCoverageRate: 375,
  productModifier: 1,
  wasteAllowancePercent: 15,
} as const;

describe("surface-adjusted paint material coverage", () => {
  it("calculates smooth painted drywall", () => {
    const result=calculatePaintGallons({...base,surfaceType:"smooth_previously_painted_drywall"});
    expect(result.coatAdjustedArea).toBe(2000);
    expect(result.wasteFactor).toBeCloseTo(0.869565,6);
    expect(result.effectiveCoverageRate).toBeCloseTo(326.086956,5);
    expect(result.rawGallonsRequired).toBeCloseTo(6.1333,4);
  });
  it("requires more paint for medium orange peel", () => {
    const smooth=calculatePaintGallons({...base,surfaceType:"smooth_previously_painted_drywall"});
    const textured=calculatePaintGallons({...base,surfaceType:"medium_orange_peel"});
    expect(textured.effectiveCoverageRate).toBeCloseTo(293.4783,4);
    expect(textured.rawGallonsRequired).toBeCloseTo(6.8148,4);
    expect(textured.rawGallonsRequired).toBeGreaterThan(smooth.rawGallonsRequired);
  });
  it("requires more paint for heavy stucco than medium orange peel", () => {
    expect(calculatePaintGallons({...base,surfaceType:"heavy_stucco"}).rawGallonsRequired)
      .toBeGreaterThan(calculatePaintGallons({...base,surfaceType:"medium_orange_peel"}).rawGallonsRequired);
  });
  it("uses a waste factor of one with no allowance", () => {
    expect(calculatePaintGallons({...base,surfaceType:"smooth_metal",wasteAllowancePercent:0}).wasteFactor).toBe(1);
  });
  it("supports the explicit legacy fallback", () => {
    const result=calculatePaintGallons({...base,surfaceType:null,legacySurfaceFallback:true});
    expect(result.surfaceType).toBe(LEGACY_SURFACE_TYPE);
    expect(result.surfaceModifier).toBe(1);
  });
  it("rejects unsupported surface keys", () => {
    expect(()=>calculatePaintGallons({...base,surfaceType:"unknown" as never})).toThrow(/unsupported surface type/i);
  });
  it("keeps dropdown configuration alphabetized", () => {
    expect(SURFACE_TYPES.map(surface=>surface.label)).toEqual([...SURFACE_TYPES].map(surface=>surface.label).sort());
  });
  it("keeps labels free of modifier values", () => {
    for(const surface of SURFACE_TYPES) expect(surface.label).not.toMatch(/\d\.\d/);
  });
  it("changing surface type recalculates gallons without changing labor inputs", () => {
    const smooth=calculatePaintGallons({...base,surfaceType:"smooth_previously_painted_drywall"});
    const brick=calculatePaintGallons({...base,surfaceType:"unpainted_brick"});
    expect(brick.coatAdjustedArea).toBe(smooth.coatAdjustedArea);
    expect(brick.rawGallonsRequired).toBeGreaterThan(smooth.rawGallonsRequired);
  });
  it("does not double-count the waste allowance", () => {
    const result=calculatePaintGallons({...base,surfaceType:"smooth_previously_painted_drywall"});
    expect(result.rawGallonsRequired).toBeCloseTo((2000*1.15)/375,10);
  });
});
