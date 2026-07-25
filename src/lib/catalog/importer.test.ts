import { describe, expect, it } from "vitest";
import { detectDuplicatePaintRows, validateApprovedPaintImportRow } from "./importer";

describe("approved catalog importer", () => {
  it("normalizes supported brand aliases and codes", () => {
    const result = validateApprovedPaintImportRow({
      brand: "Rustoleum", color_code: " #abc–12 ", color_name: "Test color",
      lrv: "45.5", interior_recommended: true,
    }, 1);
    expect(result.errors).toEqual([]);
    expect(result.data).toMatchObject({
      canonicalBrand: "Rust-Oleum", normalizedColorCode: "ABC-12", lrv: 45.5,
    });
  });

  it("rejects unsupported brands and invalid color metadata", () => {
    expect(validateApprovedPaintImportRow({
      brand: "Made Up", color_code: "1", color_name: "Test", lrv: 101,
    }, 4).errors.length).toBeGreaterThan(0);
  });

  it("detects duplicate canonical brand/code pairs", () => {
    const first = validateApprovedPaintImportRow({
      brand: "PPG", color_code: "01-2", color_name: "One",
    }, 1).data!;
    const second = validateApprovedPaintImportRow({
      brand: "PPG Paints", color_code: "#01-2", color_name: "Two",
    }, 2).data!;
    expect(detectDuplicatePaintRows([first, second])).toHaveLength(1);
  });
});

