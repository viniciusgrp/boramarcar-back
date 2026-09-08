import {
  generateRandomReferralCodeLength,
  generateReferralCode,
  normalizeReferralCode,
} from './referral-code.util';

describe('referral-code.util', () => {
  it('normalizes referral codes', () => {
    expect(normalizeReferralCode(' ab-12 ')).toBe('AB-12');
  });

  it('generates codes with 6 to 8 characters', () => {
    const code = generateReferralCode(8);
    expect(code).toHaveLength(8);
    expect(generateRandomReferralCodeLength()).toBeGreaterThanOrEqual(6);
    expect(generateRandomReferralCodeLength()).toBeLessThanOrEqual(8);
  });
});
