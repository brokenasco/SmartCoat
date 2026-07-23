"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export function AuthForm({ initialSignup = false, configured = true }: { initialSignup?: boolean; configured?: boolean }) {
  const [signup, setSignup] = useState(initialSignup); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(formData: FormData) {
    if (!configured) {
      setMessage("Authentication is not configured yet. Add the Supabase URL and publishable key to .env.local, then restart the development server.");
      return;
    }
    setBusy(true); setMessage(""); const email=String(formData.get("email")); const password=String(formData.get("password")); const supabase=createClient();
    const result = signup ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback` } }) : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false); if (result.error) return setMessage(result.error.message); if (signup) return setMessage("Check your email to verify your account."); location.assign("/dashboard");
  }
  return <form action={submit} className="space-y-5">{!configured&&<p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Supabase setup required.</strong><br/>Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to <code>.env.local</code>, then restart the server.</p>}<label className="block text-sm font-medium">Email<input required name="email" type="email" autoComplete="email" disabled={!configured} className="mt-2 min-h-12 w-full rounded-lg border border-border bg-white px-3 disabled:bg-stone-100"/></label><label className="block text-sm font-medium">Password<input required name="password" type="password" minLength={10} autoComplete={signup?"new-password":"current-password"} disabled={!configured} className="mt-2 min-h-12 w-full rounded-lg border border-border bg-white px-3 disabled:bg-stone-100"/></label>{message&&<p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}<button disabled={busy||!configured} className="min-h-12 w-full rounded-lg bg-brand px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy?"Working…":signup?"Create company account":"Sign in"}</button><button type="button" disabled={!configured} onClick={()=>setSignup(!signup)} className="w-full text-sm font-medium text-brand disabled:opacity-50">{signup?"Already have an account? Sign in":"New to SmartCoat? Create an account"}</button></form>;
}
