"use client";

import { useState } from "react";
import { NumericInput } from "@/components/numeric-input";
import { parseNumericInput } from "@/lib/domain/numeric-input";
import { createClient } from "@/lib/supabase/browser";

function numericValue(value: string) {
  const parsed = parseNumericInput(value);
  return parsed.state === "valid" ? parsed.value : null;
}

export function ManagementSettingsForm({ companyId, initialAverageHourlyPayCents, initialOverheadPercent }: {
  companyId: string;
  initialAverageHourlyPayCents: number;
  initialOverheadPercent: number;
}) {
  const [hourlyPay, setHourlyPay] = useState((initialAverageHourlyPayCents / 100).toFixed(2));
  const [overhead, setOverhead] = useState(String(initialOverheadPercent));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [fieldError, setFieldError] = useState("");

  async function save() {
    if (saving) return;
    const pay = numericValue(hourlyPay);
    const overheadValue = numericValue(overhead);
    if (pay === null || pay < 0 || overheadValue === null || overheadValue < 0 || overheadValue >= 100) {
      setFieldError("Enter an hourly pay of $0 or more and project overhead from 0% through 99.99%.");
      return;
    }
    setFieldError("");
    setMessage("Saving…");
    setSaving(true);
    const { error } = await createClient().rpc("update_company_estimate_settings", {
      target_company: companyId,
      average_pay_cents: Math.round(pay * 100),
      overhead_percent: overheadValue,
    });
    setSaving(false);
    if (error) {
      console.error("management_settings_update_failed", { code: error.code, message: error.message });
      setMessage("We could not update the management settings. Please try again.");
      return;
    }
    setMessage("Management settings updated.");
  }

  return <section className="mt-6 max-w-2xl rounded-xl border border-border bg-surface p-5 sm:p-7">
    <h2 className="text-xl font-semibold">Management Settings</h2>
    <p className="mt-1 text-sm text-muted">These values will be used as defaults for new estimates. Existing drafts and approved estimates keep their saved snapshots.</p>
    <div className="mt-6 grid gap-5 sm:grid-cols-2">
      <NumericInput label="Average Hourly Pay" value={hourlyPay} prefix="$" suffix="per hour" min={0} onChange={setHourlyPay}/>
      <NumericInput label="Project Overhead" value={overhead} suffix="%" min={0} max={99.99} onChange={setOverhead}/>
    </div>
    {fieldError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{fieldError}</p>}
    <button type="button" onClick={save} disabled={saving} className="mt-6 min-h-11 rounded-lg bg-brand px-5 font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save Changes"}</button>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
  </section>;
}
