import { z } from "zod";
import { paintSearchResultSchema } from "@/lib/domain/paint-catalog";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().min(2).max(100),
  brandId: z.uuid().optional(),
  scope: z.enum(["interior", "exterior", "interior_exterior"]).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

export async function GET(request: Request) {
  const startedAt = Date.now();
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "Enter at least two characters and use valid filters." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase.rpc("search_paint_catalog", {
    search_term: parsed.data.q,
    brand_filter: parsed.data.brandId ?? null,
    scope_filter: parsed.data.scope ?? null,
    result_limit: parsed.data.limit ?? 12,
  });
  if (error) {
    console.error("[paint-search] database error", { code: error.code, elapsedMs: Date.now() - startedAt });
    return Response.json(
      { error: "Paint catalog search is temporarily unavailable." },
      { status: 503 },
    );
  }

  const results = z.array(paintSearchResultSchema).safeParse(data);
  if (!results.success) {
    return Response.json({ error: "Invalid catalog response." }, { status: 502 });
  }
  if (results.data.length === 0) {
    const { data: membership } = await supabase
      .from("company_memberships")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    await supabase.from("paint_unmatched_searches").insert({
      company_id: membership?.company_id ?? null,
      user_id: user.id,
      normalized_query: parsed.data.q.trim().toUpperCase().slice(0, 100),
      brand_filter: parsed.data.brandId ?? null,
    });
  }
  console.info("[paint-search] completed", {
    resultCount: results.data.length,
    elapsedMs: Date.now() - startedAt,
  });
  return Response.json(
    { results: results.data, colorNotice: "Digital swatches are approximations only." },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
