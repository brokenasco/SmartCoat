import { describe, expect, it } from "vitest";
import { unavailableRetailerPrice } from "./retailer-pricing";

describe("retailer price states", () => {
  it("never fabricates a price when an exact product is not carried", () => {
    expect(unavailableRetailerPrice("lowes", false)).toEqual({
      status:"not_carried",
      retailer:"lowes",
      message:"This exact product is not carried by this retailer.",
    });
  });

  it("distinguishes a matched product with unavailable current price", () => {
    expect(unavailableRetailerPrice("home_depot", true).status).toBe("price_unavailable");
  });
});
