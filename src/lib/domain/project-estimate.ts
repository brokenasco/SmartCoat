import Decimal from "decimal.js";

export type RoomCostSummary = { roomId: string; directCostCents: number };
export type ProjectEstimateInput = {
  rooms: RoomCostSummary[];
  projectLevelDirectMaterialsCents?: number;
  overheadPercent?: number;
  targetGrossMarginPercent: number;
};

const money = (value: Decimal) => value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

export function calculateProjectEstimate({
  rooms,
  projectLevelDirectMaterialsCents = 0,
  overheadPercent = 15,
  targetGrossMarginPercent,
}: ProjectEstimateInput) {
  if (!rooms.length) throw new RangeError("At least one room is required.");
  if (!Number.isFinite(projectLevelDirectMaterialsCents) || projectLevelDirectMaterialsCents < 0) throw new RangeError("Project-level direct materials cannot be negative.");
  if (!Number.isFinite(overheadPercent) || overheadPercent < 0) throw new RangeError("Overhead cannot be negative.");
  if (!Number.isFinite(targetGrossMarginPercent) || targetGrossMarginPercent < 0 || targetGrossMarginPercent >= 100) throw new RangeError("Target gross margin must be at least 0% and less than 100%.");
  const roomDirectCostTotalCents = rooms.reduce((sum, room) => {
    if (!Number.isFinite(room.directCostCents) || room.directCostCents < 0) throw new RangeError("Room direct cost cannot be negative.");
    return sum.plus(room.directCostCents);
  }, new Decimal(0));
  const adjustedProjectDirectCostCents = roomDirectCostTotalCents.plus(projectLevelDirectMaterialsCents);
  const overheadCents = adjustedProjectDirectCostCents.mul(overheadPercent).div(100);
  const totalInternalCostCents = adjustedProjectDirectCostCents.plus(overheadCents);
  const finalCustomerEstimateCents = totalInternalCostCents.div(new Decimal(1).minus(new Decimal(targetGrossMarginPercent).div(100)));
  const roundedInternal = money(totalInternalCostCents);
  const roundedFinal = money(finalCustomerEstimateCents);
  return {
    roomDirectCostTotalCents: money(roomDirectCostTotalCents),
    projectLevelDirectMaterialsCents: money(new Decimal(projectLevelDirectMaterialsCents)),
    adjustedProjectDirectCostCents: money(adjustedProjectDirectCostCents),
    overheadCents: money(overheadCents),
    totalInternalCostCents: roundedInternal,
    finalCustomerEstimateCents: roundedFinal,
    expectedGrossProfitCents: roundedFinal - roundedInternal,
  };
}
