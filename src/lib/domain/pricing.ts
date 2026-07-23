import Decimal from "decimal.js";

export type PricingInput = {
  laborCostCents: number; materialCostCents: number; otherDirectCostCents?: number;
  overheadPercent: number; targetMarginPercent: number; discountCents?: number;
  taxPercent?: number; depositPercent?: number;
};

const cents = (value: Decimal) => value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

export function calculatePricing(input: PricingInput) {
  const directCost = new Decimal(input.laborCostCents).plus(input.materialCostCents).plus(input.otherDirectCostCents ?? 0);
  const overhead = directCost.mul(input.overheadPercent).div(100);
  const totalCost = directCost.plus(overhead);
  if (input.targetMarginPercent < 0 || input.targetMarginPercent >= 100) throw new RangeError("Target margin must be from 0 through 99.99%.");
  const priceBeforeDiscount = totalCost.div(new Decimal(1).minus(new Decimal(input.targetMarginPercent).div(100)));
  const discount = Decimal.min(new Decimal(input.discountCents ?? 0), priceBeforeDiscount);
  const subtotal = priceBeforeDiscount.minus(discount);
  const grossProfit = subtotal.minus(totalCost);
  const tax = subtotal.mul(input.taxPercent ?? 0).div(100);
  const total = subtotal.plus(tax);
  const deposit = total.mul(input.depositPercent ?? 0).div(100);
  return {
    directCostCents: cents(directCost), overheadCents: cents(overhead), totalCostCents: cents(totalCost),
    subtotalCents: cents(subtotal), grossProfitCents: cents(grossProfit),
    grossMarginPercent: subtotal.isZero() ? 0 : grossProfit.div(subtotal).mul(100).toDecimalPlaces(2).toNumber(),
    taxCents: cents(tax), totalCents: cents(total), depositCents: cents(deposit), balanceCents: cents(total.minus(deposit)),
  };
}

export function formatMoney(centsValue: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(centsValue / 100);
}
