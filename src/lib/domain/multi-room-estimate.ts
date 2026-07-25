import { calculateEstimate, type EstimateEngineInput, type Opening } from "./estimate-engine";
import { ESTIMATION_ASSUMPTIONS } from "./estimation-config";

export type RoomEstimateInput = {
  id: string;
  name: string;
  lengthFeet: number;
  widthFeet: number;
  heightFeet: number;
  openings: Opening[];
  coats: number;
  coverageSqFtPerGallon: number;
  wastePercent: number;
  containerSizeGallons: number;
  containerQuantity?: number;
  pricePerContainerCents: number;
  crewSize: number;
  averageWageCentsPerHour: number;
  prepPersonHours: number;
  retailer: EstimateEngineInput["retailer"];
  pricingSource: EstimateEngineInput["pricingSource"];
  pricingTimestamp: string;
};

export function calculateMultiRoomEstimate(rooms: RoomEstimateInput[], targetGrossMarginPercent: number) {
  if (!rooms.length) throw new RangeError("At least one room is required.");
  const results = rooms.map(room => {
    const result = calculateEstimate({
      room: { lengthFeet: room.lengthFeet, widthFeet: room.widthFeet, heightFeet: room.heightFeet },
      openings: room.openings,
      coats: room.coats,
      coverageSqFtPerGallon: room.coverageSqFtPerGallon,
      wastePercent: ESTIMATION_ASSUMPTIONS.paintWastePercent,
      containerSizeGallons: room.containerSizeGallons,
      containerQuantity: room.containerQuantity,
      pricePerContainerCents: room.pricePerContainerCents,
      productionRateSqFtPerHour: ESTIMATION_ASSUMPTIONS.productionRateSqFtPerPersonHour,
      prepHours: room.prepPersonHours,
      crewSize: room.crewSize,
      averageWageCentsPerHour: room.averageWageCentsPerHour,
      laborBurdenPercent: ESTIMATION_ASSUMPTIONS.laborBurdenPercent,
      overheadPercent: ESTIMATION_ASSUMPTIONS.overheadPercent,
      targetGrossMarginPercent,
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
  const contractorCostCents = sum("totalContractorCostCents");
  const customerEstimateCents = Math.round(contractorCostCents / (1 - targetGrossMarginPercent / 100));
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
      overheadCents: sum("overheadCents"),
      contractorCostCents,
      customerEstimateCents,
      expectedGrossProfitCents: customerEstimateCents - contractorCostCents,
      estimatedElapsedHours: sum("estimatedElapsedHours"),
    },
  };
}
