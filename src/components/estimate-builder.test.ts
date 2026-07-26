import { describe, expect, it } from "vitest";
import { friendlyEstimateError } from "./estimate-builder";

describe("estimate persistence error messages", () => {
  it("shows authorization only for a real authorization failure", () => {
    expect(friendlyEstimateError({code:"42501",message:"new row violates row-level security policy"},"draft"))
      .toBe("You do not have permission to update this estimate.");
  });
  it("does not mislabel constraints or unexpected failures as authorization", () => {
    expect(friendlyEstimateError({code:"23503",message:"foreign key violation"},"draft"))
      .toBe("Complete the required estimate information before saving.");
    expect(friendlyEstimateError({code:"XX000",message:"database unavailable"},"draft"))
      .toBe("We could not save this estimate as a draft. Please try again.");
    expect(friendlyEstimateError({code:"42501",message:"permission denied for function surface_modifier"},"draft"))
      .toBe("We could not save this estimate as a draft. Please try again.");
  });
});
