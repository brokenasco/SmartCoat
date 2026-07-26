import { describe, expect, it } from "vitest";
import { ESTIMATE_NAVIGATION_ORDER } from "./estimate-navigation";

describe("estimate navigation", () => {
  it("places Management immediately before Drafts and Approved", () => {
    expect(ESTIMATE_NAVIGATION_ORDER).toEqual(["Management","Drafts","Approved"]);
  });
});
