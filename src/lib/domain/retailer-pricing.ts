import type { Retailer } from "./estimate-engine";

const UPDATED_AT = "2026-07-23T00:00:00.000Z";
const ESTIMATED_PRICES: Record<Retailer, number> = { home_depot: 4798, lowes: 5248 };

export function getEstimatedRetailerPrice(retailer: Retailer, zipCode: string) {
  if (!/^\d{5}$/.test(zipCode)) throw new RangeError("Enter a valid five-digit ZIP code.");
  if (!(retailer in ESTIMATED_PRICES)) throw new RangeError("Unsupported retailer.");
  return { pricePerGallonCents: ESTIMATED_PRICES[retailer], source: "estimated_config" as const, updatedAt: UPDATED_AT, isLocationSpecific: false, zipCode };
}
