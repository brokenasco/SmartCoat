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

export type PaintContainerOption = { containerSizeGallons: number; unitPriceCents: number };
export type PaintContainerSelection = PaintContainerOption & {
  quantity: number;
  extendedPriceCents: number;
};

export function optimizePaintContainers(
  rawGallonsRequired: number,
  options: PaintContainerOption[],
): PaintContainerSelection[] {
  finiteAtLeast(rawGallonsRequired, 0, "Raw gallons required");
  if (!options.length) throw new RangeError("At least one paint container option is required.");
  const normalized = [...options]
    .map(option => {
      finiteAtLeast(option.containerSizeGallons, Number.MIN_VALUE, "Container size");
      finiteAtLeast(option.unitPriceCents, 0, "Container price");
      return { ...option, milliGallons: Math.round(option.containerSizeGallons * 1000) };
    })
    .sort((a,b)=>b.containerSizeGallons-a.containerSizeGallons || a.unitPriceCents-b.unitPriceCents);
  const required = Math.ceil(rawGallonsRequired * 1000 - 1e-9);
  const maxSize = normalized[0].milliGallons;
  const limit = required + maxSize;
  const best: Array<{ cost: number; count: number; quantities: number[] } | undefined> = Array(limit + 1);
  best[0] = { cost: 0, count: 0, quantities: normalized.map(()=>0) };
  for (let gallons = 0; gallons <= limit; gallons += 1) {
    const current = best[gallons];
    if (!current) continue;
    normalized.forEach((option,index) => {
      const nextGallons = Math.min(limit, gallons + option.milliGallons);
      const candidate = {
        cost: current.cost + option.unitPriceCents,
        count: current.count + 1,
        quantities: current.quantities.map((quantity,position)=>quantity+(position===index?1:0)),
      };
      const existing = best[nextGallons];
      if (!existing || candidate.cost < existing.cost
        || (candidate.cost === existing.cost && candidate.count < existing.count)
        || (candidate.cost === existing.cost && candidate.count === existing.count
          && candidate.quantities.join(",") > existing.quantities.join(","))) {
        best[nextGallons] = candidate;
      }
    });
  }
  const winner = best.slice(required).reduce<{ gallons: number; value: NonNullable<typeof best[number]> } | null>((selected,value,offset) => {
    if (!value) return selected;
    const gallons = required + offset;
    if (!selected || value.cost < selected.value.cost
      || (value.cost === selected.value.cost && gallons < selected.gallons)
      || (value.cost === selected.value.cost && gallons === selected.gallons && value.count < selected.value.count)) {
      return { gallons, value };
    }
    return selected;
  }, null);
  if (!winner) throw new RangeError("A valid paint-container combination could not be calculated.");
  return normalized.flatMap((option,index) => winner.value.quantities[index]
    ? [{
      containerSizeGallons: option.containerSizeGallons,
      unitPriceCents: option.unitPriceCents,
      quantity: winner.value.quantities[index],
      extendedPriceCents: option.unitPriceCents * winner.value.quantities[index],
    }]
    : []);
}

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
