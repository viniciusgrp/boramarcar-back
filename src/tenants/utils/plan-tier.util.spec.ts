import { canAccessDepositFeatures } from './plan-tier.util';

describe('plan-tier.util', () => {
  describe('canAccessDepositFeatures', () => {
    it('allows Elite plan without override', () => {
      expect(canAccessDepositFeatures('ELITE')).toBe(true);
      expect(canAccessDepositFeatures('ELITE', false)).toBe(true);
    });

    it('blocks Solo and Pro without override', () => {
      expect(canAccessDepositFeatures('SOLO')).toBe(false);
      expect(canAccessDepositFeatures('PRO')).toBe(false);
    });

    it('allows non-Elite plans when deposit feature is enabled', () => {
      expect(canAccessDepositFeatures('SOLO', true)).toBe(true);
      expect(canAccessDepositFeatures('PRO', true)).toBe(true);
    });
  });
});
