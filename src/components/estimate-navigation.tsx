import Link from "next/link";

export const ESTIMATE_NAVIGATION_ORDER = ["Management","Drafts","Approved"] as const;

export function EstimateNavigation({ active, canManage, draftCount, approvedCount }: {
  active: "management" | "draft" | "approved";
  canManage: boolean;
  draftCount?: number;
  approvedCount?: number;
}) {
  return <nav className="mt-6 flex flex-wrap gap-2" aria-label="Estimate sections">
    {canManage && <Tab href="/dashboard/estimates/management" active={active === "management"}>Management</Tab>}
    <Tab href="/dashboard/estimates?tab=draft" active={active === "draft"}>Drafts{draftCount === undefined ? "" : ` (${draftCount})`}</Tab>
    <Tab href="/dashboard/estimates?tab=approved" active={active === "approved"}>Approved{approvedCount === undefined ? "" : ` (${approvedCount})`}</Tab>
  </nav>;
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return <Link href={href} aria-current={active ? "page" : undefined} className={`rounded-lg px-4 py-3 font-semibold ${active ? "bg-brand text-white" : "border border-border bg-surface"}`}>{children}</Link>;
}
