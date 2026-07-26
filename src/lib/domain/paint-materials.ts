import Decimal from "decimal.js";
import { getSurfaceTypeByKey, LEGACY_SURFACE_TYPE, type SurfaceTypeKey } from "./surface-types";

export type CalculatePaintGallonsInput = {
  netPaintableArea: number;
  numberOfCoats: number;
  productCoverageRate: number;
  surfaceType?: SurfaceTypeKey | null;
  productModifier?: number;
  wasteAllowancePercent?: number;
  legacySurfaceFallback?: boolean;
};

const finiteAtLeast = (value: number, minimum: number, label: string) => {
  if (!Number.isFinite(value) || value < minimum) throw new RangeError(`${label} must be ${minimum === 0 ? "zero or greater" : "greater than zero"}.`);
};

export function calculatePaintGallons({
  netPaintableArea,
  numberOfCoats,
  productCoverageRate,
  surfaceType,
  productModifier = 1,
  wasteAllowancePercent = 15,
  legacySurfaceFallback = false,
}: CalculatePaintGallonsInput) {
  finiteAtLeast(netPaintableArea, 0, "Net paintable area");
  finiteAtLeast(numberOfCoats, Number.MIN_VALUE, "Number of coats");
  finiteAtLeast(productCoverageRate, Number.MIN_VALUE, "Product coverage rate");
  finiteAtLeast(productModifier, Number.MIN_VALUE, "Product modifier");
  finiteAtLeast(wasteAllowancePercent, 0, "Waste allowance");
  const surface = getSurfaceTypeByKey(surfaceType, legacySurfaceFallback);
  if (!surface) throw new RangeError(`Unsupported surface type: ${surfaceType ?? ""}`);

  const coatAdjustedArea = new Decimal(netPaintableArea).mul(numberOfCoats);
  const wasteFactor = new Decimal(1).div(new Decimal(1).plus(new Decimal(wasteAllowancePercent).div(100)));
  const effectiveCoverageRate = new Decimal(productCoverageRate).mul(surface.modifier).mul(productModifier).mul(wasteFactor);
  if (!effectiveCoverageRate.isFinite() || effectiveCoverageRate.lte(0)) throw new RangeError("Effective coverage rate must be greater than zero.");
  const rawGallonsRequired = coatAdjustedArea.div(effectiveCoverageRate);
  return {
    surfaceType: surface.key,
    surfaceLabel: surface.label,
    coatAdjustedArea: coatAdjustedArea.toNumber(),
    surfaceModifier: surface.modifier,
    productModifier,
    wasteAllowancePercent,
    wasteFactor: wasteFactor.toNumber(),
    effectiveCoverageRate: effectiveCoverageRate.toNumber(),
    rawGallonsRequired: rawGallonsRequired.toNumber(),
  };
}

export { LEGACY_SURFACE_TYPE };
