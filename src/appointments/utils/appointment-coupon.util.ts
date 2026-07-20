export type AppointmentCouponRelation =
  | { code: string }
  | { code: string }[]
  | null
  | undefined;

export interface AppointmentCouponFieldsInput {
  coupon_id?: string | null;
  coupon_discount_amount?: number | string | null;
  coupons?: AppointmentCouponRelation;
}

export interface AppointmentCouponFields {
  couponCode: string | null;
  couponDiscountAmount: number | null;
}

function extractCouponCode(relation: AppointmentCouponRelation): string | null {
  if (!relation) {
    return null;
  }

  const code = Array.isArray(relation) ? relation[0]?.code : relation.code;
  const trimmed = code?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Maps raw appointment coupon columns + optional `coupons` join into the
 * AdminAppointment coupon display fields.
 */
export function mapAppointmentCouponFields(
  row: AppointmentCouponFieldsInput,
): AppointmentCouponFields {
  const hasCoupon = Boolean(row.coupon_id?.trim());
  if (!hasCoupon) {
    return { couponCode: null, couponDiscountAmount: null };
  }

  const rawDiscount = row.coupon_discount_amount;
  const discountAmount =
    rawDiscount === null || rawDiscount === undefined || rawDiscount === ''
      ? null
      : Number(rawDiscount);

  return {
    couponCode: extractCouponCode(row.coupons),
    couponDiscountAmount:
      discountAmount !== null && Number.isFinite(discountAmount)
        ? discountAmount
        : null,
  };
}
