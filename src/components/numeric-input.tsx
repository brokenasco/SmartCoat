"use client";

import { useId, useState } from "react";
import { numericFieldError, parseNumericInput } from "@/lib/domain/numeric-input";

export type NumericInputProps = {
  label: string;
  value: string;
  onChange: (rawValue: string, parsedValue: number | null) => void;
  required?: boolean;
  min?: number;
  max?: number;
  integer?: boolean;
  step?: string;
  prefix?: string;
  suffix?: string;
  className?: string;
};

export function NumericInput({
  label, value, onChange, required = true, min, max, integer = false,
  step, prefix, suffix, className = "",
}: NumericInputProps) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const error = touched
    ? numericFieldError(value, { label, required, min, max, integer })
    : null;

  return <label htmlFor={id} className={`text-sm font-medium ${className}`}>
    {label}
    <span className="mt-1 flex min-h-11 items-center rounded-lg border border-border bg-surface focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
      {prefix && <span className="pl-3 text-muted" aria-hidden="true">{prefix}</span>}
      <input
        id={id}
        value={value}
        type="text"
        inputMode={integer ? "numeric" : "decimal"}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onBlur={() => setTouched(true)}
        onChange={event => {
          const raw = event.target.value;
          const parsed = parseNumericInput(raw);
          onChange(raw, parsed.state === "valid" ? parsed.value : null);
        }}
        step={step}
        className="min-h-10 min-w-0 flex-1 bg-transparent px-3 font-mono outline-none"
      />
      {suffix && <span className="pr-3 text-xs text-muted" aria-hidden="true">{suffix}</span>}
    </span>
    {error && <span id={`${id}-error`} role="alert" className="mt-1 block text-xs text-red-700">{error}</span>}
  </label>;
}
