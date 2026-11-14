import type { AppointmentLoyaltyServiceLine } from '../../services/utils/service-loyalty-points.util';
import { extractLoyaltyPointsEarnedFromRelation } from '../../services/utils/service-loyalty-points.util';

interface AppointmentServiceLoyaltyRow {
  service_id?: string;
  price: number | null;
  services?:
    | { loyalty_points_earned?: number | null }
    | { loyalty_points_earned?: number | null }[]
    | null;
}

interface AppointmentLoyaltySourceRow {
  service_id: string;
  total_price: number | null;
  appointment_services?:
    | AppointmentServiceLoyaltyRow[]
    | AppointmentServiceLoyaltyRow
    | null;
  services?:
    | { loyalty_points_earned?: number | null; price?: number | null }
    | { loyalty_points_earned?: number | null; price?: number | null }[]
    | null;
}

function normalizeRelationRows<T>(relation: T | T[] | null | undefined): T[] {
  if (!relation) {
    return [];
  }

  if (Array.isArray(relation)) {
    return relation;
  }

  return [relation];
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Spreads the coupon across every line before currency points are calculated.
 * Lines with fixed service points keep that fixed amount; only their price
 * share of the coupon changes, and that price is ignored for those points.
 * Professional and affiliate commission stay on the full line price.
 */
export function applyCouponDiscountToLoyaltyPrices(
  lines: AppointmentLoyaltyServiceLine[],
  couponDiscountAmount: number | null | undefined,
): AppointmentLoyaltyServiceLine[] {
  const discount = roundCurrency(Number(couponDiscountAmount ?? 0));

  if (discount <= 0 || lines.length === 0) {
    return lines;
  }

  const priced = lines.map((line, index) => ({
    index,
    cents: Math.max(0, Math.round(Number(line.price ?? 0) * 100)),
  }));
  const baseCents = priced.reduce((sum, line) => sum + line.cents, 0);

  if (baseCents <= 0) {
    return lines;
  }

  const discountCents = Math.min(Math.round(discount * 100), baseCents);
  const shares = priced.map((line) =>
    Math.floor((discountCents * line.cents) / baseCents),
  );
  const allocated = shares.reduce((sum, share) => sum + share, 0);
  const remainder = discountCents - allocated;
  const lastPricedIndex = [...priced]
    .reverse()
    .find((line) => line.cents > 0)?.index;

  if (lastPricedIndex !== undefined && remainder > 0) {
    shares[lastPricedIndex] += remainder;
  }

  return lines.map((line, index) => ({
    ...line,
    price: Math.max(0, ((priced[index]?.cents ?? 0) - (shares[index] ?? 0)) / 100),
  }));
}

export function buildAppointmentLoyaltyServiceLines(
  row: AppointmentLoyaltySourceRow,
): AppointmentLoyaltyServiceLine[] {
  const junctionRows = normalizeRelationRows(row.appointment_services);

  if (junctionRows.length > 0) {
    return junctionRows.map((junctionRow) => ({
      price: Number(junctionRow.price ?? 0),
      loyaltyPointsEarned: extractLoyaltyPointsEarnedFromRelation(
        junctionRow.services,
      ),
    }));
  }

  const primaryService = normalizeRelationRows(row.services)[0];

  return [
    {
      price: Number(row.total_price ?? primaryService?.price ?? 0),
      loyaltyPointsEarned: extractLoyaltyPointsEarnedFromRelation(row.services),
    },
  ];
}
