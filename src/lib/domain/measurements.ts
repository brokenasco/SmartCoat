export type RoomDimensions = { length: number; width: number; height: number; doors?: number; windows?: number };

export function feetAndInches(feet: number, inches = 0) {
  if (feet < 0 || inches < 0 || inches >= 12) throw new RangeError("Use non-negative feet and inches below 12.");
  return feet + inches / 12;
}

export function calculateRoom(dimensions: RoomDimensions) {
  const { length, width, height, doors = 0, windows = 0 } = dimensions;
  if ([length, width, height].some((value) => value <= 0)) throw new RangeError("Room dimensions must be positive.");
  const perimeter = 2 * (length + width);
  const grossWallArea = perimeter * height;
  const openingArea = doors * 21 + windows * 15;
  return {
    floorArea: length * width,
    ceilingArea: length * width,
    perimeter,
    grossWallArea,
    openingArea,
    netWallArea: Math.max(0, grossWallArea - openingArea),
  };
}

import { ESTIMATION_ASSUMPTIONS } from "./estimation-config";

export function paintGallons(area: number, coveragePerGallon: number, coats: number, wastePercent: number = ESTIMATION_ASSUMPTIONS.paintWastePercent) {
  if (area < 0 || coveragePerGallon <= 0 || coats <= 0 || wastePercent < 0) throw new RangeError("Invalid paint calculation input.");
  const calculated = (area * coats * (1 + wastePercent / 100)) / coveragePerGallon;
  return { calculated, purchaseQuantity: Math.ceil(calculated) };
}
