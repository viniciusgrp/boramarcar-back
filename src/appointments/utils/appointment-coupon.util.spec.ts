import { mapAppointmentCouponFields } from './appointment-coupon.util';

describe('mapAppointmentCouponFields', () => {
  it('returns null fields when coupon_id is absent', () => {
    expect(
      mapAppointmentCouponFields({
        coupon_id: null,
        coupon_discount_amount: 15,
        coupons: { code: 'BEMVINDO10' },
      }),
    ).toEqual({ couponCode: null, couponDiscountAmount: null });
  });

  it('maps discount and coupon code from object relation', () => {
    expect(
      mapAppointmentCouponFields({
        coupon_id: 'coupon-1',
        coupon_discount_amount: '12.50',
        coupons: { code: 'BEMVINDO10' },
      }),
    ).toEqual({ couponCode: 'BEMVINDO10', couponDiscountAmount: 12.5 });
  });

  it('maps coupon code from array relation', () => {
    expect(
      mapAppointmentCouponFields({
        coupon_id: 'coupon-1',
        coupon_discount_amount: 8,
        coupons: [{ code: 'PROMO8' }],
      }),
    ).toEqual({ couponCode: 'PROMO8', couponDiscountAmount: 8 });
  });

  it('keeps discount when code join is missing', () => {
    expect(
      mapAppointmentCouponFields({
        coupon_id: 'coupon-1',
        coupon_discount_amount: 5,
        coupons: null,
      }),
    ).toEqual({ couponCode: null, couponDiscountAmount: 5 });
  });
});
