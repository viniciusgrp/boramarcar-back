import type { Coupon } from '../entities/coupon.entity';

/** Rounds to 2 decimal places (currency), never negative and never above totalPrice. */
export function calculateCouponDiscountAmount(
  coupon: Pick<Coupon, 'discount_type' | 'discount_value'>,
  totalPrice: number,
): number {
  const safeTotal = Number.isFinite(totalPrice) && totalPrice > 0 ? totalPrice : 0;

  if (safeTotal <= 0) {
    return 0;
  }

  const rawDiscount =
    coupon.discount_type === 'PERCENTAGE'
      ? safeTotal * (coupon.discount_value / 100)
      : coupon.discount_value;

  const clamped = Math.min(Math.max(rawDiscount, 0), safeTotal);

  return Math.round(clamped * 100) / 100;
}
