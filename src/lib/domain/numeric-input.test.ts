import { describe, expect, it } from "vitest";
import { numericFieldError, parseNumericInput } from "./numeric-input";

describe("numeric input editing", () => {
  it("preserves blank and partial decimal editing states", () => {
    expect(parseNumericInput("")).toEqual({ state: "empty", value: null });
    expect(parseNumericInput("12.")).toEqual({ state: "partial", value: null });
    expect(parseNumericInput(".")).toEqual({ state: "partial", value: null });
    expect(parseNumericInput(".5")).toEqual({ state: "valid", value: 0.5 });
  });

  it("rejects NaN, Infinity, and malformed pasted values", () => {
    expect(parseNumericInput("NaN").state).toBe("invalid");
    expect(parseNumericInput("Infinity").state).toBe("invalid");
    expect(parseNumericInput("1.2.3").state).toBe("invalid");
  });

  it("applies field-specific ranges and whole-number rules", () => {
    expect(numericFieldError("", { label: "Coverage", required: true, min: 1 })).toBe("Coverage is required.");
    expect(numericFieldError("0", { label: "Coverage", required: true, min: 1 })).toContain("at least 1");
    expect(numericFieldError("1.5", { label: "Containers", required: true, min: 1, integer: true })).toContain("whole number");
    expect(numericFieldError("5", { label: "Containers", required: true, min: 1, integer: true })).toBeNull();
  });
});

