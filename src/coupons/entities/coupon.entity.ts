export type CouponDiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT';

export interface Coupon {
  id: string;
  tenant_id: string;
  code: string;
  description: string | null;
  discount_type: CouponDiscountType;
  discount_value: number;
  max_uses: number | null;
  used_count: number;
  max_uses_per_customer: number | null;
  first_visit_only: boolean;
  min_purchase_amount: number | null;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
