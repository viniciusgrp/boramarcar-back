import { normalizeFirstVisitAt } from './normalize-first-visit-at.util';

describe('normalizeFirstVisitAt', () => {
  it('returns null for missing values', () => {
    expect(normalizeFirstVisitAt(undefined)).toBeNull();
    expect(normalizeFirstVisitAt(null)).toBeNull();
    expect(normalizeFirstVisitAt('')).toBeNull();
    expect(normalizeFirstVisitAt('   ')).toBeNull();
  });

  it('converts epoch milliseconds number to ISO', () => {
    expect(normalizeFirstVisitAt(1794425797521)).toBe(
      '2026-11-11T19:36:37.521Z',
    );
  });

  it('converts numeric string epoch milliseconds to ISO', () => {
    expect(normalizeFirstVisitAt('1794425797521')).toBe(
      '2026-11-11T19:36:37.521Z',
    );
  });

  it('normalizes ISO 8601 strings', () => {
    expect(normalizeFirstVisitAt('2026-11-10T19:00:00.000Z')).toBe(
      '2026-11-10T19:00:00.000Z',
    );
  });

  it('drops clearly invalid values', () => {
    expect(normalizeFirstVisitAt('not-a-date')).toBeNull();
    expect(normalizeFirstVisitAt(Number.NaN)).toBeNull();
    expect(normalizeFirstVisitAt(Infinity)).toBeNull();
    expect(normalizeFirstVisitAt({})).toBeNull();
    expect(normalizeFirstVisitAt([])).toBeNull();
  });
});
