export interface CouponRedemption {
  id: string;
  coupon_id: string;
  tenant_id: string;
  customer_id: string | null;
  customer_phone: string | null;
  appointment_id: string;
  discount_amount_applied: number;
  created_at: string;
}

export interface CouponRedemptionHistoryItem extends CouponRedemption {
  coupon_code: string;
  customer_name: string | null;
  appointment_start_time: string | null;
}
