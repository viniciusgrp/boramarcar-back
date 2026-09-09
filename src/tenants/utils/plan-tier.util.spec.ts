import {
  canAccessDepositFeatures,
  canAccessInventoryFeatures,
  canAccessLoyaltyFeatures,
  canAddActiveProfessional,
  canCustomizeAdminThemeColors,
  getProfessionalLimit,
  getProfessionalLimitMessage,
  normalizePlanTier,
} from './plan-tier.util';

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

  describe('canAccessLoyaltyFeatures', () => {
    it('is available on all plan tiers', () => {
      expect(canAccessLoyaltyFeatures('SOLO')).toBe(true);
      expect(canAccessLoyaltyFeatures('PRO')).toBe(true);
      expect(canAccessLoyaltyFeatures('ELITE')).toBe(true);
    });
  });

  describe('professional limits', () => {
    it('normalizes unknown tiers to Solo', () => {
      expect(normalizePlanTier('ELITE')).toBe('ELITE');
      expect(normalizePlanTier('nope')).toBe('SOLO');
      expect(normalizePlanTier(null)).toBe('SOLO');
    });

    it('enforces Solo and Pro headcount and leaves Elite unlimited', () => {
      expect(getProfessionalLimit('SOLO')).toBe(1);
      expect(getProfessionalLimit('PRO')).toBe(5);
      expect(getProfessionalLimit('ELITE')).toBeNull();
      expect(canAddActiveProfessional('SOLO', 1)).toBe(false);
      expect(canAddActiveProfessional('PRO', 4)).toBe(true);
      expect(canAddActiveProfessional('ELITE', 50)).toBe(true);
      expect(getProfessionalLimitMessage('SOLO')).toContain('Solo');
      expect(getProfessionalLimitMessage('ELITE')).toBeNull();
    });

    it('gates theme customization and inventory', () => {
      expect(canCustomizeAdminThemeColors('SOLO')).toBe(false);
      expect(canCustomizeAdminThemeColors('PRO')).toBe(true);
      expect(canAccessInventoryFeatures('SOLO')).toBe(true);
    });
  });
});
