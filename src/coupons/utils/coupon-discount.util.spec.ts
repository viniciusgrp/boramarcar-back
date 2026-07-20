import { calculateCouponDiscountAmount } from './coupon-discount.util';

describe('calculateCouponDiscountAmount', () => {
  it('calculates a percentage discount', () => {
    const discount = calculateCouponDiscountAmount(
      { discount_type: 'PERCENTAGE', discount_value: 15 },
      200,
    );

    expect(discount).toBe(30);
  });

  it('rounds a percentage discount to two decimal places', () => {
    const discount = calculateCouponDiscountAmount(
      { discount_type: 'PERCENTAGE', discount_value: 33.333 },
      10,
    );

    expect(discount).toBe(3.33);
  });

  it('clamps a fixed amount discount to the total price', () => {
    const discount = calculateCouponDiscountAmount(
      { discount_type: 'FIXED_AMOUNT', discount_value: 500 },
      80,
    );

    expect(discount).toBe(80);
  });

  it('returns zero when the total price is not positive', () => {
    const discount = calculateCouponDiscountAmount(
      { discount_type: 'FIXED_AMOUNT', discount_value: 10 },
      0,
    );

    expect(discount).toBe(0);
  });
});
