import {
  calculateProductMarginPercent,
  isProductLowStock,
} from './low-stock.util';

describe('low-stock.util', () => {
  it('flags stock at or below the alert threshold', () => {
    expect(isProductLowStock(2, 3)).toBe(true);
    expect(isProductLowStock(4, 3)).toBe(false);
    expect(isProductLowStock(0, 0)).toBe(false);
  });

  it('computes margin percent from cost', () => {
    expect(calculateProductMarginPercent(10, 15)).toBe(50);
    expect(calculateProductMarginPercent(0, 15)).toBeNull();
  });
});
