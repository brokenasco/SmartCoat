"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

export function AccountMenu({ userName, companyName, role }: {
  userName: string;
  companyName: string;
  role: string;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError("");
    const { error: signOutError } = await createClient().auth.signOut();
    if (signOutError) {
      setSigningOut(false);
      setError("We could not log you out. Please try again.");
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return <details className="relative">
    <summary aria-label={`Open account menu for ${userName}`} className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-2 text-right hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
      <span>
        <span className="block text-sm font-medium">{userName}</span>
        <span className="block text-xs text-muted">{companyName} · {role.replaceAll("_", " ")}</span>
      </span>
      <ChevronDown aria-hidden="true" size={16} className="text-muted"/>
    </summary>
    <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-border bg-white p-2 text-left shadow-xl">
      <button type="button" onClick={signOut} disabled={signingOut} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
        <LogOut aria-hidden="true" size={17}/>
        {signingOut ? "Logging out…" : "Log out"}
      </button>
      {error && <p role="alert" className="px-3 py-2 text-xs text-red-700">{error}</p>}
    </div>
  </details>;
}
