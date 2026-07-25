import type { Retailer } from "./estimate-engine";

export type RetailerPriceState =
  | {
      status: "available";
      retailer: Exclude<Retailer, "manual_supplier">;
      pricePerContainerCents: number;
      salePricePerContainerCents: number | null;
      containerSizeGallons: number;
      source: "live_provider" | "authorized_feed";
      collectedAt: string;
      isEstimated: false;
    }
  | {
      status: "not_carried" | "price_unavailable";
      retailer: Exclude<Retailer, "manual_supplier">;
      message: string;
    };

export function unavailableRetailerPrice(
  retailer: Exclude<Retailer, "manual_supplier">,
  exactProductMatched: boolean,
): RetailerPriceState {
  return exactProductMatched
    ? { status: "price_unavailable", retailer, message: "Product match found, but current price is unavailable." }
    : { status: "not_carried", retailer, message: "This exact product is not carried by this retailer." };
}

/** @deprecated ZIP-based configured prices were removed in formula v3. */
export function getEstimatedRetailerPrice(retailer: Exclude<Retailer, "manual_supplier">) {
  return unavailableRetailerPrice(retailer, false);
}
