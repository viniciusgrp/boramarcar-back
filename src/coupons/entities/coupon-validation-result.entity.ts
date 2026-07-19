import type { Coupon } from './coupon.entity';

export interface CouponValidationResult {
  coupon: Coupon;
  discountAmount: number;
  finalPrice: number;
}
