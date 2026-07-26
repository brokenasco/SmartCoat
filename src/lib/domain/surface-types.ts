export const SURFACE_TYPES = [
  { key: "bare_drywall", label: "Bare Drywall", modifier: 0.8 },
  { key: "concrete_block", label: "Concrete Block", modifier: 0.65 },
  { key: "fine_stucco", label: "Fine Stucco", modifier: 0.75 },
  { key: "heavy_orange_peel", label: "Heavy Orange Peel", modifier: 0.85 },
  { key: "heavy_stucco", label: "Heavy Stucco", modifier: 0.6 },
  { key: "knockdown_texture", label: "Knockdown Texture", modifier: 0.85 },
  { key: "light_orange_peel", label: "Light Orange Peel", modifier: 0.95 },
  { key: "medium_orange_peel", label: "Medium Orange Peel", modifier: 0.9 },
  { key: "painted_brick", label: "Painted Brick", modifier: 0.75 },
  { key: "popcorn_ceiling", label: "Popcorn Ceiling", modifier: 0.75 },
  { key: "rough_wood_or_cedar", label: "Rough Wood or Cedar", modifier: 0.7 },
  { key: "smooth_metal", label: "Smooth Metal", modifier: 1 },
  { key: "smooth_previously_painted_drywall", label: "Smooth Previously Painted Drywall", modifier: 1 },
  { key: "smooth_wood", label: "Smooth Wood", modifier: 0.9 },
  { key: "unpainted_brick", label: "Unpainted Brick", modifier: 0.6 },
] as const;

export type SurfaceTypeKey = typeof SURFACE_TYPES[number]["key"];
export const LEGACY_SURFACE_TYPE: SurfaceTypeKey = "smooth_previously_painted_drywall";

export function getSurfaceTypeByKey(key: string | null | undefined, legacyFallback = false) {
  const resolvedKey = legacyFallback && !key ? LEGACY_SURFACE_TYPE : key;
  return SURFACE_TYPES.find(surface => surface.key === resolvedKey);
}
