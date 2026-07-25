import { describe, expect, it } from "vitest";
import { calculateMultiRoomEstimate, type RoomEstimateInput } from "./multi-room-estimate";

const room = (overrides: Partial<RoomEstimateInput> = {}): RoomEstimateInput => ({
  id: crypto.randomUUID(), name: "Room 1", lengthFeet: 10, widthFeet: 8, heightFeet: 4.1666667,
  openings: [], coats: 1, coverageSqFtPerGallon: 400, wastePercent: 0,
  containerSizeGallons: 1, pricePerContainerCents: 5000, crewSize: 2,
  averageWageCentsPerHour: 2500, prepPersonHours: 0, retailer: "manual_supplier",
  pricingSource: "manual", pricingTimestamp: "2026-07-25T00:00:00Z", ...overrides,
});

describe("formula v4 multi-room estimates", () => {
  it("uses 150 square feet per paint person-hour", () => {
    expect(calculateMultiRoomEstimate([room()], 45).rooms[0].laborHours).toBe(1);
  });
  it("adds coats and prep without multiplying by workers", () => {
    expect(calculateMultiRoomEstimate([room({ coats: 2, prepPersonHours: 2 })], 45).rooms[0].laborHours).toBe(4);
  });
  it("uses 20% burden and 15% overhead", () => {
    const result = calculateMultiRoomEstimate([room({ averageWageCentsPerHour: 10000 })], 0).rooms[0];
    expect(result.totalLaborCostCents).toBe(12000);
    expect(result.overheadCents).toBe(Math.round((12000 + 5000) * 0.15));
  });
  it("calculates rooms independently", () => {
    const result = calculateMultiRoomEstimate([room(), room({ id: "two", averageWageCentsPerHour: 3000 })], 45);
    expect(result.rooms).toHaveLength(2);
    expect(result.totals.laborPersonHours).toBe(2);
  });
  it("rejects openings larger than the wall surface", () => {
    expect(() => calculateMultiRoomEstimate([room({ openings: [{ kind: "window", widthFeet: 100, heightFeet: 100 }] })], 45)).toThrow(/opening area exceeds/i);
  });
});
