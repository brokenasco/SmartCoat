export const ESTIMATION_ASSUMPTIONS = Object.freeze({
  formulaVersion: "5.0.0",
  productionRateSqFtPerPersonHour: 150,
  laborBurdenPercent: 20,
  overheadPercent: 15,
  paintWastePercent: 15,
  defaultGrossMarginPercent: 45,
  maximumGrossMarginPercent: 70,
  productiveHoursPerDay: 8,
  roundingPolicy: "half_up_cent",
  marginMode: "gross_margin" as const,
});
