import { z } from "zod";
import { paintSearchResultSchema } from "@/lib/domain/paint-catalog";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().min(2).max(100),
  brandId: z.uuid().optional(),
  scope: z.enum(["interior", "exterior", "interior_exterior"]).optional(),
});

export async function GET(request: Request) {
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
    result_limit: 20,
  });
  if (error) {
    return Response.json(
      { error: "Paint catalog search is temporarily unavailable." },
      { status: 503 },
    );
  }

  const results = z.array(paintSearchResultSchema).safeParse(data);
  if (!results.success) {
    return Response.json({ error: "Invalid catalog response." }, { status: 502 });
  }
  return Response.json(
    { results: results.data, colorNotice: "Digital swatches are approximations only." },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
