import { calculateEstimate, type EstimateEngineInput, type Opening } from "./estimate-engine";
import { ESTIMATION_ASSUMPTIONS } from "./estimation-config";
import type { SurfaceTypeKey } from "./surface-types";
import { calculateProjectEstimate } from "./project-estimate";

export type RoomEstimateInput = {
  id: string;
  name: string;
  lengthFeet: number;
  widthFeet: number;
  heightFeet: number;
  openings: Opening[];
  coats: number;
  wastePercent: number;
  surfaceType: SurfaceTypeKey;
  containerSizeGallons: number;
  pricePerContainerCents: number;
  crewSize: number;
  averageWageCentsPerHour: number;
  prepPersonHours: number;
  retailer: EstimateEngineInput["retailer"];
  pricingSource: EstimateEngineInput["pricingSource"];
  pricingTimestamp: string;
};

export function calculateMultiRoomEstimate(
  rooms: RoomEstimateInput[],
  targetGrossMarginPercent: number,
  overheadPercent: number = ESTIMATION_ASSUMPTIONS.overheadPercent,
) {
  if (!rooms.length) throw new RangeError("At least one room is required.");
  const results = rooms.map(room => {
    const result = calculateEstimate({
      room: { lengthFeet: room.lengthFeet, widthFeet: room.widthFeet, heightFeet: room.heightFeet },
      openings: room.openings,
      coats: room.coats,
      coverageSqFtPerGallon: ESTIMATION_ASSUMPTIONS.baseCoverageRateSqFtPerGallon,
      wastePercent: ESTIMATION_ASSUMPTIONS.paintWastePercent,
      surfaceType: room.surfaceType,
      productModifier: ESTIMATION_ASSUMPTIONS.defaultProductModifier,
      containerSizeGallons: room.containerSizeGallons,
      pricePerContainerCents: room.pricePerContainerCents,
      productionRateSqFtPerHour: ESTIMATION_ASSUMPTIONS.productionRateSqFtPerPersonHour,
      prepHours: room.prepPersonHours,
      crewSize: room.crewSize,
      averageWageCentsPerHour: room.averageWageCentsPerHour,
      laborBurdenPercent: ESTIMATION_ASSUMPTIONS.laborBurdenPercent,
      overheadPercent: 0,
      targetGrossMarginPercent: 0,
      productiveHoursPerDay: ESTIMATION_ASSUMPTIONS.productiveHoursPerDay,
      retailer: room.retailer,
      pricingSource: room.pricingSource,
      pricingTimestamp: room.pricingTimestamp,
    });
    if (result.deductedOpeningAreaSqFt > result.grossSurfaceAreaSqFt) {
      throw new RangeError(`${room.name}: opening area exceeds gross wall area.`);
    }
    return { roomId: room.id, roomName: room.name, ...result };
  });
  const sum = (field: keyof typeof results[number]) => results.reduce((total, result) => total + (typeof result[field] === "number" ? result[field] as number : 0), 0);
  const project = calculateProjectEstimate({
    rooms: results.map(result=>({roomId:result.roomId,directCostCents:result.directCostCents})),
    overheadPercent,
    targetGrossMarginPercent,
  });
  return {
    formulaVersion: ESTIMATION_ASSUMPTIONS.formulaVersion,
    assumptions: ESTIMATION_ASSUMPTIONS,
    rooms: results,
    totals: {
      grossWallAreaSqFt: sum("grossSurfaceAreaSqFt"),
      openingAreaSqFt: sum("deductedOpeningAreaSqFt"),
      netPaintableAreaSqFt: sum("netPaintableAreaSqFt"),
      rawGallonsRequired: sum("rawGallonsRequired"),
      gallonsPurchased: sum("gallonsPurchased"),
      paintCostCents: sum("paintCostCents"),
      laborPersonHours: sum("laborHours"),
      loadedLaborCostCents: sum("totalLaborCostCents"),
      directCostCents: project.projectDirectCostCents,
      overheadCents: project.overheadCents,
      contractorCostCents: project.totalInternalCostCents,
      customerEstimateCents: project.finalCustomerEstimateCents,
      expectedGrossProfitCents: project.expectedGrossProfitCents,
      estimatedElapsedHours: sum("estimatedElapsedHours"),
    },
  };
}
