import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EstimateBuilder } from "@/components/estimate-builder";
import { createClient } from "@/lib/supabase/server";

export default async function EditEstimate({params}:{params:Promise<{id:string}>}){
  const {id}=await params; const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect("/login");
  const {data:membership}=await supabase.from("company_memberships").select("company_id,role").eq("user_id",user.id).eq("status","active").limit(1).single(); if(!membership) redirect("/dashboard");
  const [{data:estimate},{data:brands}]=await Promise.all([
    supabase.from("estimates").select("id,title,status,draft_payload").eq("id",id).eq("company_id",membership.company_id).is("deleted_at",null).single(),
    supabase.from("paint_brands").select("id,name").eq("is_active",true).order("name"),
  ]);
  if(!estimate) notFound(); if(estimate.status!=="draft") redirect(`/dashboard/estimates/${id}`);
  return <main className="min-h-screen"><header className="border-b bg-surface"><div className="mx-auto max-w-7xl px-5 py-4"><Link href="/dashboard/estimates" className="font-semibold text-brand">← Estimates</Link></div></header><div className="mx-auto max-w-7xl px-5 py-8"><p className="text-sm text-muted">Draft estimate</p><h1 className="mb-7 text-3xl font-semibold">Continue estimate</h1><EstimateBuilder companyId={membership.company_id} brands={brands??[]} estimateId={estimate.id} initialTitle={estimate.title} initialPayload={estimate.draft_payload as never} canManageFinancials={["owner","admin","manager"].includes(membership.role)}/></div></main>;
}
