import { z } from "zod";
import {
  PAINT_CATALOG_PARSER_VERSION,
  canonicalizePaintBrand,
  normalizePaintIdentifier,
} from "@/lib/domain/paint-catalog";

export const approvedPaintImportRowSchema = z.object({
  brand: z.string().trim().min(1).max(160),
  color_code: z.string().trim().min(1).max(80),
  color_name: z.string().trim().min(1).max(160),
  hex_value: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  lrv: z.coerce.number().min(0).max(100).optional(),
  interior_recommended: z.boolean().optional(),
  exterior_recommended: z.boolean().optional(),
  external_color_id: z.string().trim().max(160).optional(),
});

export type ApprovedPaintImportRow = z.infer<typeof approvedPaintImportRowSchema>;

export type ValidatedPaintImportRow = ApprovedPaintImportRow & {
  canonicalBrand: string;
  normalizedColorCode: string;
  parserVersion: string;
  sourceRecordIdentifier: string;
};

export function validateApprovedPaintImportRow(
  input: unknown,
  rowNumber: number,
): { data?: ValidatedPaintImportRow; errors: string[] } {
  const parsed = approvedPaintImportRowSchema.safeParse(input);
  if (!parsed.success) {
    return {
      errors: parsed.error.issues.map(
        issue => `row ${rowNumber} ${issue.path.join(".")}: ${issue.message}`,
      ),
    };
  }
  const canonicalBrand = canonicalizePaintBrand(parsed.data.brand);
  if (!canonicalBrand) {
    return { errors: [`row ${rowNumber} brand: unsupported manufacturer`] };
  }
  return {
    data: {
      ...parsed.data,
      canonicalBrand,
      normalizedColorCode: normalizePaintIdentifier(parsed.data.color_code),
      parserVersion: PAINT_CATALOG_PARSER_VERSION,
      sourceRecordIdentifier:
        parsed.data.external_color_id ??
        `${canonicalBrand}:${normalizePaintIdentifier(parsed.data.color_code)}`,
    },
    errors: [],
  };
}

export function detectDuplicatePaintRows(rows: ValidatedPaintImportRow[]) {
  const seen = new Set<string>();
  return rows.flatMap((row, index) => {
    const key = `${row.canonicalBrand}:${row.normalizedColorCode}`;
    if (seen.has(key)) return [`row ${index + 1}: duplicate catalog key ${key}`];
    seen.add(key);
    return [];
  });
}

