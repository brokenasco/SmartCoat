import { describe, expect, it } from "vitest";
import {
  canonicalizePaintBrand,
  estimatePaintSelectionSchema,
  normalizePaintIdentifier,
  resolveConfidentPaintMatch,
  type PaintSearchResult,
} from "./paint-catalog";

const match = (overrides: Partial<PaintSearchResult> = {}): PaintSearchResult => ({
  color_id: "00000000-0000-4000-8000-000000000001",
  brand_id: "00000000-0000-4000-8000-000000000002",
  brand_name: "Behr",
  color_code: "N430-6A",
  color_name: "Example",
  hex_value: null,
  interior_recommended: true,
  exterior_recommended: null,
  is_discontinued: false,
  matched_by: "exact_code",
  rank: 1,
  ...overrides,
});

describe("paint catalog normalization", () => {
  it("normalizes case, whitespace, leading hash, and Unicode dashes", () => {
    expect(normalizePaintIdentifier("  #n430–6a  ")).toBe("N430-6A");
  });

  it("preserves meaningful internal punctuation", () => {
    expect(normalizePaintIdentifier(" 00/12.4-A ")).toBe("00/12.4-A");
  });

  it("canonicalizes required aliases without inventing new brands", () => {
    expect(canonicalizePaintBrand("Sherman Williams")).toBe("Sherwin-Williams");
    expect(canonicalizePaintBrand("Gliddon")).toBe("Glidden");
    expect(canonicalizePaintBrand("Unknown Paint Co")).toBeNull();
  });
});

describe("paint match safety", () => {
  it("does not silently choose between two brands with the same code", () => {
    expect(
      resolveConfidentPaintMatch([
        match(),
        match({
          color_id: "00000000-0000-4000-8000-000000000003",
          brand_id: "00000000-0000-4000-8000-000000000004",
          brand_name: "Valspar",
        }),
      ]),
    ).toBeNull();
  });

  it("uses an explicit brand preference to disambiguate", () => {
    const preferred = "00000000-0000-4000-8000-000000000004";
    expect(
      resolveConfidentPaintMatch([
        match(),
        match({
          color_id: "00000000-0000-4000-8000-000000000003",
          brand_id: preferred,
          brand_name: "Valspar",
        }),
      ], preferred)?.brand_name,
    ).toBe("Valspar");
  });

  it("requires a reason for a manual coverage override", () => {
    const result = estimatePaintSelectionSchema.safeParse({
      paintColorId: null,
      brandName: "Manual",
      colorName: "Customer sample",
      colorCode: "CUSTOM",
      productName: null,
      productType: null,
      projectUse: "interior",
      sheen: null,
      coverageRate: 350,
      coverageSource: "manual_override",
      coverageWasOverridden: true,
      coverageOverrideReason: null,
      containerSizeGallons: 1,
      containerQuantity: 3,
      pricePerContainerCents: 5000,
      retailerName: null,
      notes: null,
      isManualEntry: true,
    });
    expect(result.success).toBe(false);
  });
});

