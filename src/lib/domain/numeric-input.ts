export type NumericParseResult =
  | { state: "empty" | "partial"; value: null }
  | { state: "valid"; value: number }
  | { state: "invalid"; value: null };

export function parseNumericInput(rawValue: string): NumericParseResult {
  const value = rawValue.trim();
  if (value === "") return { state: "empty", value: null };
  if (/^[+-]?(?:\.|\d+\.)$/.test(value)) return { state: "partial", value: null };
  if (!/^[+-]?(?:\d+|\d*\.\d+)$/.test(value)) return { state: "invalid", value: null };
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? { state: "valid", value: parsed }
    : { state: "invalid", value: null };
}

export function numericFieldError(
  rawValue: string,
  options: { label: string; required?: boolean; min?: number; max?: number; integer?: boolean },
) {
  const parsed = parseNumericInput(rawValue);
  if (parsed.state === "empty" || parsed.state === "partial") {
    return options.required ? `${options.label} is required.` : null;
  }
  if (parsed.state !== "valid") return `${options.label} must be a valid number.`;
  if (options.integer && !Number.isInteger(parsed.value)) return `${options.label} must be a whole number.`;
  if (options.min != null && parsed.value < options.min) return `${options.label} must be at least ${options.min}.`;
  if (options.max != null && parsed.value > options.max) return `${options.label} must be at most ${options.max}.`;
  return null;
}
