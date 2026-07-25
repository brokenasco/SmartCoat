import Decimal from "decimal.js";

export const ESTIMATE_FORMULA_VERSION = "4.0.0";
export type Retailer = "home_depot" | "lowes" | "manual_supplier";
export type Opening = { widthFeet: number; heightFeet: number; quantity?: number; kind: "window" | "door" | "other" };
export type EstimateEngineInput = {
  room: { lengthFeet: number; widthFeet: number; heightFeet: number };
  openings: Opening[];
  coats: number;
  primerCoats?: number;
  coverageSqFtPerGallon: number;
  wastePercent: number;
  containerSizesGallons?: number[];
  /** Compatibility input for v2 snapshots. New estimates use pricePerContainerCents. */
  paintPricePerGallonCents?: number;
  containerSizeGallons?: number;
  containerQuantity?: number;
  pricePerContainerCents?: number;
  additionalMaterialsCents?: number;
  productionRateSqFtPerHour: number;
  prepHours?: number;
  crewSize: number;
  averageWageCentsPerHour: number;
  laborBurdenPercent: number;
  overheadPercent: number;
  targetGrossMarginPercent: number;
  productiveHoursPerDay: number;
  taxPercent?: number;
  discountCents?: number;
  retailer: Retailer;
  /** Project location only. It never affects pricing or calculation. */
  projectPostalCode?: string;
  /** Retained for reading v2 inputs. It never affects v3 pricing or calculation. */
  zipCode?: string;
  pricingSource: "estimated_config" | "live_provider" | "manual" | "unavailable";
  pricingTimestamp: string;
};

const money = (value: Decimal) => value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
const positive = (value: number, label: string) => { if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be greater than zero.`); };

export function calculateEstimate(input: EstimateEngineInput) {
  positive(input.room.lengthFeet, "Room length"); positive(input.room.widthFeet, "Room width"); positive(input.room.heightFeet, "Wall height");
  positive(input.coverageSqFtPerGallon, "Paint coverage"); positive(input.productionRateSqFtPerHour, "Production rate");
  positive(input.crewSize, "Crew size"); positive(input.productiveHoursPerDay, "Productive hours per day");
  positive(input.averageWageCentsPerHour, "Average hourly wage");
  if (!Number.isInteger(input.crewSize)) throw new RangeError("Crew size must be a whole number.");
  if (!Number.isInteger(input.coats) || input.coats < 1) throw new RangeError("Coats must be a positive whole number.");
  if (input.prepHours != null && input.prepHours < 0) throw new RangeError("Prep hours cannot be negative.");
  if (input.wastePercent < 0 || input.wastePercent > 100 || input.laborBurdenPercent < 0 || input.laborBurdenPercent > 100 || input.overheadPercent < 0 || input.overheadPercent > 100) throw new RangeError("Percentage inputs must be from 0 through 100.");
  if (input.targetGrossMarginPercent < 0 || input.targetGrossMarginPercent >= 100) throw new RangeError("Target gross margin must be from 0 through 99.99%.");
  if (input.pricePerContainerCents != null && (!Number.isFinite(input.pricePerContainerCents) || input.pricePerContainerCents < 0)) throw new RangeError("Price per container cannot be negative.");
  if (input.paintPricePerGallonCents != null && (!Number.isFinite(input.paintPricePerGallonCents) || input.paintPricePerGallonCents < 0)) throw new RangeError("Paint price cannot be negative.");

  const perimeter = new Decimal(input.room.lengthFeet).plus(input.room.widthFeet).mul(2);
  const grossSurfaceArea = perimeter.mul(input.room.heightFeet);
  const openingArea = input.openings.reduce((sum, opening) => {
    if (opening.widthFeet < 0 || opening.heightFeet < 0 || (opening.quantity ?? 1) < 0) throw new RangeError("Opening dimensions cannot be negative.");
    return sum.plus(new Decimal(opening.widthFeet).mul(opening.heightFeet).mul(opening.quantity ?? 1));
  }, new Decimal(0));
  const warnings: string[] = [];
  if (openingArea.gt(grossSurfaceArea)) warnings.push("Opening area exceeds gross wall area; net area was limited to zero.");
  const netPaintableArea = Decimal.max(0, grossSurfaceArea.minus(openingArea));
  const totalCoats = new Decimal(input.coats).plus(input.primerCoats ?? 0);
  const adjustedCoverageRequirement = netPaintableArea.mul(totalCoats).mul(new Decimal(1).plus(new Decimal(input.wastePercent).div(100)));
  const rawGallonsRequired = adjustedCoverageRequirement.div(input.coverageSqFtPerGallon);
  const sizes = (input.containerSizesGallons?.length ? input.containerSizesGallons : [5, 1, 0.25]).filter(size => size > 0).sort((a,b)=>b-a);
  const smallest = sizes.at(-1) ?? 1;
  const containerSizeGallons = input.containerSizeGallons ?? smallest;
  positive(containerSizeGallons, "Container size");
  const containersRequired = rawGallonsRequired.div(containerSizeGallons).ceil().toNumber();
  if (input.containerQuantity != null && (!Number.isInteger(input.containerQuantity) || input.containerQuantity < 1)) throw new RangeError("Container quantity must be a positive whole number.");
  const purchaseQuantity = Math.max(containersRequired, input.containerQuantity ?? containersRequired);
  if (input.containerQuantity != null && input.containerQuantity < containersRequired) warnings.push("Container quantity was increased to cover the calculated paint requirement.");
  const gallonsPurchased = new Decimal(containerSizeGallons).mul(purchaseQuantity);
  const excessGallons = Decimal.max(0, gallonsPurchased.minus(rawGallonsRequired));
  const recommendedGallons = gallonsPurchased;
  const containers = sizes.map(size => ({ sizeGallons: size, quantity: 0 }));
  let remaining = recommendedGallons.toNumber();
  for (const container of containers) { container.quantity = Math.floor((remaining + 1e-9) / container.sizeGallons); remaining -= container.quantity * container.sizeGallons; }

  const pricePerContainer = input.pricePerContainerCents != null
    ? new Decimal(input.pricePerContainerCents)
    : new Decimal(input.paintPricePerGallonCents ?? 0).mul(containerSizeGallons);
  const paintCost = pricePerContainer.mul(purchaseQuantity);
  const materialSubtotal = paintCost.plus(input.additionalMaterialsCents ?? 0);
  const laborHours = adjustedCoverageRequirement.div(input.productionRateSqFtPerHour).plus(input.prepHours ?? 0);
  const elapsedCrewHours = laborHours.div(input.crewSize);
  const workingDays = elapsedCrewHours.div(input.productiveHoursPerDay);
  const wageCost = laborHours.mul(input.averageWageCentsPerHour);
  const laborBurden = wageCost.mul(input.laborBurdenPercent).div(100);
  const totalLaborCost = wageCost.plus(laborBurden);
  const directCost = materialSubtotal.plus(totalLaborCost);
  const overhead = directCost.mul(input.overheadPercent).div(100);
  const contractorCost = directCost.plus(overhead);
  const preDiscountPrice = contractorCost.div(new Decimal(1).minus(new Decimal(input.targetGrossMarginPercent).div(100)));
  const customerSubtotal = Decimal.max(0, preDiscountPrice.minus(input.discountCents ?? 0));
  const tax = customerSubtotal.mul(input.taxPercent ?? 0).div(100);
  const customerEstimate = customerSubtotal.plus(tax);
  const grossProfit = customerSubtotal.minus(contractorCost);
  const grossMargin = customerSubtotal.isZero() ? new Decimal(0) : grossProfit.div(customerSubtotal).mul(100);
  if (input.pricingSource === "estimated_config") warnings.push("Configured pricing is an estimate, not a retailer quote.");
  if (input.pricingSource === "unavailable") warnings.push("No retailer price is available; enter a verified supplier price before presenting the estimate.");
  return {
    formulaVersion: ESTIMATE_FORMULA_VERSION,
    grossSurfaceAreaSqFt: grossSurfaceArea.toDecimalPlaces(2).toNumber(),
    deductedOpeningAreaSqFt: openingArea.toDecimalPlaces(2).toNumber(),
    netPaintableAreaSqFt: netPaintableArea.toDecimalPlaces(2).toNumber(),
    adjustedCoverageSqFt: adjustedCoverageRequirement.toDecimalPlaces(2).toNumber(),
    rawGallonsRequired: rawGallonsRequired.toDecimalPlaces(3).toNumber(),
    recommendedGallons: recommendedGallons.toNumber(), containers,
    containerSizeGallons,
    containersRequired,
    purchaseQuantity,
    gallonsPurchased: gallonsPurchased.toDecimalPlaces(3).toNumber(),
    excessGallons: excessGallons.toDecimalPlaces(3).toNumber(),
    pricePerContainerCents: money(pricePerContainer),
    paintCostCents: money(paintCost),
    materialSubtotalCents: money(materialSubtotal), laborHours: laborHours.toDecimalPlaces(2).toNumber(),
    crewSize: input.crewSize, estimatedElapsedHours: elapsedCrewHours.toDecimalPlaces(2).toNumber(),
    estimatedWorkingDays: workingDays.toDecimalPlaces(2).toNumber(), wageCostCents: money(wageCost),
    laborBurdenCents: money(laborBurden), totalLaborCostCents: money(totalLaborCost),
    overheadCents: money(overhead), totalContractorCostCents: money(contractorCost),
    targetGrossMarginPercent: input.targetGrossMarginPercent, customerSubtotalCents: money(customerSubtotal),
    taxCents: money(tax), customerEstimateCents: money(customerEstimate), expectedGrossProfitCents: money(grossProfit),
    expectedGrossMarginPercent: grossMargin.toDecimalPlaces(2).toNumber(), warnings,
    assumptions: {
      ...input,
      zipCode: undefined,
      projectPostalCode: input.projectPostalCode ?? input.zipCode,
      pricingClaim: input.pricingSource === "live_provider"
        ? "Provider-supplied"
        : input.pricingSource === "manual" ? "Manual supplier price" : input.pricingSource === "unavailable" ? "Unavailable" : "Estimated configuration",
    },
  };
}

export type EstimateValidationResult =
  | { ok: true; value: ReturnType<typeof calculateEstimate>; errors: [] }
  | { ok: false; value: null; errors: { field: string; message: string }[] };

export function tryCalculateEstimate(input: EstimateEngineInput): EstimateValidationResult {
  try {
    return { ok: true, value: calculateEstimate(input), errors: [] };
  } catch (error) {
    return {
      ok: false,
      value: null,
      errors: [{
        field: "estimate",
        message: error instanceof Error ? error.message : "Estimate inputs are invalid.",
      }],
    };
  }
}
