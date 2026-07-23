import { describe, expect, it } from "vitest";
import { calculateRoom, feetAndInches, paintGallons } from "./measurements";

describe("measurement engine", () => {
  it("converts feet and inches", () => expect(feetAndInches(14, 7)).toBeCloseTo(14.5833, 4));
  it("calculates transparent room surfaces", () => expect(calculateRoom({ length: 14, width: 15, height: 8, doors: 1, windows: 2 })).toEqual({ floorArea: 210, ceilingArea: 210, perimeter: 58, grossWallArea: 464, openingArea: 51, netWallArea: 413 }));
  it("rounds paint to purchasable gallons", () => expect(paintGallons(413, 350, 2, 10)).toEqual({ calculated: 2.596, purchaseQuantity: 3 }));
  it("rejects invalid dimensions", () => expect(() => calculateRoom({ length: 0, width: 10, height: 8 })).toThrow());
});
