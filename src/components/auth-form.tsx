"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export function AuthForm({ initialSignup = false, configured = true }: { initialSignup?: boolean; configured?: boolean }) {
  const [signup, setSignup] = useState(initialSignup);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    if (!configured) {
      setMessage("Authentication is not configured yet.");
      return;
    }
    setBusy(true);
    setMessage("");
    const email = String(formData.get("email"));
    const password = String(formData.get("password"));
    const companyName = String(formData.get("companyName") ?? "");
    const supabase = createClient();
    const result = signup
      ? await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${location.origin}/auth/callback`,
            data: { company_name: companyName },
          },
        })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (result.error) return setMessage(result.error.message);
    if (signup) return setMessage("Check your email to verify your account.");
    location.assign("/dashboard");
  }

  const fieldClass = "mt-2 min-h-12 w-full rounded-lg border border-border bg-white px-3 disabled:bg-stone-100";
  return (
    <form action={submit} className="space-y-5">
      {!configured && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Supabase setup required.</strong></p>}
      {signup && <label className="block text-sm font-medium">Company name<input required name="companyName" autoComplete="organization" placeholder="Acme Painting" disabled={!configured} className={fieldClass}/></label>}
      <label className="block text-sm font-medium">Email<input required name="email" type="email" autoComplete="email" disabled={!configured} className={fieldClass}/></label>
      <label className="block text-sm font-medium">Password<input required name="password" type="password" minLength={10} autoComplete={signup ? "new-password" : "current-password"} disabled={!configured} className={fieldClass}/></label>
      {message && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}
      <button disabled={busy || !configured} className="min-h-12 w-full rounded-lg bg-brand px-4 font-semibold text-white disabled:opacity-50">{busy ? "Working…" : signup ? "Create company account" : "Sign in"}</button>
      <button type="button" disabled={!configured} onClick={() => setSignup(!signup)} className="w-full text-sm font-medium text-brand disabled:opacity-50">{signup ? "Already have an account? Sign in" : "New to SmartCoat? Create an account"}</button>
    </form>
  );
}
