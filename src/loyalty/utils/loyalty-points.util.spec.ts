import {
  calculateEarnedPoints,
  normalizePhoneKey,
} from './loyalty-points.util';

describe('loyalty-points.util', () => {
  it('normalizes brazilian phones to a 55-prefixed digit key', () => {
    expect(normalizePhoneKey('(11) 98888-7777')).toBe('5511988887777');
    expect(normalizePhoneKey('11988887777')).toBe('5511988887777');
    expect(normalizePhoneKey('5511988887777')).toBe('5511988887777');
  });

  it('treats local and international variants as the same identity key', () => {
    expect(normalizePhoneKey('11988887777')).toBe(
      normalizePhoneKey('55 11 98888-7777'),
    );
  });

  it('calculates earned points from total and rate', () => {
    expect(calculateEarnedPoints(100, 1)).toBe(100);
    expect(calculateEarnedPoints(99.9, 1)).toBe(99);
    expect(calculateEarnedPoints(0, 1)).toBe(0);
  });
});
