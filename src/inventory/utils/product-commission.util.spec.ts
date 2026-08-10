import {
  calculateProductSaleLineCommission,
  resolveCommissionPercentForProductLine,
} from './product-commission.util';

describe('resolveCommissionPercentForProductLine', () => {
  it('prioritizes the product custom commission rate', () => {
    expect(resolveCommissionPercentForProductLine(15, 5)).toBe(15);
  });

  it('falls back to the professional product commission percent', () => {
    expect(resolveCommissionPercentForProductLine(null, 8)).toBe(8);
  });

  it('returns zero when neither rate is configured', () => {
    expect(resolveCommissionPercentForProductLine(null, null)).toBe(0);
    expect(resolveCommissionPercentForProductLine(undefined, undefined)).toBe(0);
  });

  it('ignores an out-of-range custom rate and falls back', () => {
    expect(resolveCommissionPercentForProductLine(150, 10)).toBe(10);
  });
});

describe('calculateProductSaleLineCommission', () => {
  it('calculates commission amount from quantity and unit price', () => {
    const result = calculateProductSaleLineCommission(
      { quantity: 2, unitPrice: 50, customCommissionRate: null },
      10,
    );

    expect(result.commissionPercent).toBe(10);
    expect(result.commissionAmount).toBe(10);
  });

  it('uses the product custom rate over the professional default', () => {
    const result = calculateProductSaleLineCommission(
      { quantity: 1, unitPrice: 100, customCommissionRate: 20 },
      5,
    );

    expect(result.commissionPercent).toBe(20);
    expect(result.commissionAmount).toBe(20);
  });
});
