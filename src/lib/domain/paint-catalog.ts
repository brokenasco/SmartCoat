import { z } from "zod";

export const PAINT_CATALOG_PARSER_VERSION = "1.0.0";

export const CANONICAL_PAINT_BRANDS = [
  "Behr",
  "Sherwin-Williams",
  "Valspar",
  "Rust-Oleum",
  "Farrow & Ball",
  "Clare",
  "Annie Sloan",
  "PPG Paints",
  "Glidden",
  "HGTV Home by Sherwin-Williams",
  "Benjamin Moore",
] as const;

const BRAND_ALIASES: Record<string, (typeof CANONICAL_PAINT_BRANDS)[number]> = {
  "SHERMAN WILLIAMS": "Sherwin-Williams",
  "SHERWIN WILLIAMS": "Sherwin-Williams",
  RUSTOLEUM: "Rust-Oleum",
  "RUST OLEUM": "Rust-Oleum",
  "FARROW AND BALL": "Farrow & Ball",
  PPG: "PPG Paints",
  GLIDDON: "Glidden",
  "BENJAMIN MOORE PAINTS": "Benjamin Moore",
  "HGTV PAINT": "HGTV Home by Sherwin-Williams",
  "HGTV HOME": "HGTV Home by Sherwin-Williams",
};

export function normalizePaintIdentifier(value: string) {
  return value
    .trim()
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/^#/, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function canonicalizePaintBrand(value: string) {
  const normalized = normalizePaintIdentifier(value);
  return (
    BRAND_ALIASES[normalized] ??
    CANONICAL_PAINT_BRANDS.find(
      (brand) => normalizePaintIdentifier(brand) === normalized,
    ) ??
    null
  );
}

export const paintSearchResultSchema = z.object({
  color_id: z.uuid(),
  brand_id: z.uuid(),
  brand_name: z.string().min(1),
  color_code: z.string().min(1),
  color_name: z.string().min(1),
  hex_value: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable(),
  interior_recommended: z.boolean().nullable(),
  exterior_recommended: z.boolean().nullable(),
  is_discontinued: z.boolean(),
  matched_by: z.enum(["exact_code", "alias_code", "partial_code", "color_name", "brand"]),
  rank: z.number().int().min(1).max(7),
});

export type PaintSearchResult = z.infer<typeof paintSearchResultSchema>;

export const estimatePaintSelectionSchema = z
  .object({
    paintColorId: z.uuid().nullable(),
    brandName: z.string().trim().max(160).nullable(),
    colorName: z.string().trim().max(160).nullable(),
    colorCode: z.string().trim().max(80).nullable(),
    productName: z.string().trim().max(160).nullable(),
    productType: z.string().trim().max(120).nullable(),
    projectUse: z.enum(["interior", "exterior", "interior_exterior", "specialty", "unknown"]),
    sheen: z.string().trim().max(80).nullable(),
    coverageRate: z.number().min(50).max(1000),
    coverageSource: z.enum([
      "product_variant",
      "product_line",
      "company_default",
      "manual_override",
    ]),
    coverageWasOverridden: z.boolean(),
    coverageOverrideReason: z.string().trim().max(500).nullable(),
    containerSizeGallons: z.number().positive(),
    containerQuantity: z.number().int().positive(),
    pricePerContainerCents: z.number().int().nonnegative(),
    retailerName: z.string().trim().max(160).nullable(),
    notes: z.string().trim().max(1000).nullable(),
    isManualEntry: z.boolean(),
  })
  .superRefine((value, context) => {
    if (
      value.coverageWasOverridden &&
      !value.coverageOverrideReason
    ) {
      context.addIssue({
        code: "custom",
        path: ["coverageOverrideReason"],
        message: "Explain why the catalog coverage was overridden.",
      });
    }
  });

export type EstimatePaintSelection = z.infer<
  typeof estimatePaintSelectionSchema
>;

export function resolveConfidentPaintMatch(
  results: PaintSearchResult[],
  preferredBrandId?: string,
) {
  const exact = results.filter((result) =>
    ["exact_code", "alias_code"].includes(result.matched_by),
  );
  const preferred = preferredBrandId
    ? exact.filter((result) => result.brand_id === preferredBrandId)
    : exact;
  return preferred.length === 1 ? preferred[0] : null;
}

