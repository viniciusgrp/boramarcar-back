import { generateAffiliateCode, isSelfReferral, normalizeAffiliateCode } from './affiliate-code.util';
import {
  canIncludeInPayout,
  roundCommissionCents,
  shouldSkipUnpaidOrTrialInvoice,
} from './affiliate-commission.util';

describe('affiliate-code.util', () => {
  it('normalizes codes to uppercase alphanumerics', () => {
    expect(normalizeAffiliateCode(' bm-ab12 ')).toBe('BMAB12');
  });

  it('generates BM plus six alphabet characters', () => {
    const code = generateAffiliateCode(() => 0);
    expect(code).toMatch(/^BM[A-Z0-9]{6}$/);
    expect(code.startsWith('BM')).toBe(true);
  });

  it('detects self-referral by email, CPF or auth user', () => {
    expect(
      isSelfReferral({
        affiliateEmail: 'a@test.com',
        affiliateCpf: '123.456.789-01',
        affiliateAuthUserId: 'user-1',
        signupEmail: 'A@test.com',
      }),
    ).toBe(true);

    expect(
      isSelfReferral({
        affiliateEmail: 'a@test.com',
        affiliateCpf: '12345678901',
        affiliateAuthUserId: 'user-1',
        signupCpf: '123.456.789-01',
      }),
    ).toBe(true);

    expect(
      isSelfReferral({
        affiliateEmail: 'a@test.com',
        affiliateCpf: '12345678901',
        affiliateAuthUserId: 'user-1',
        signupUserId: 'user-1',
      }),
    ).toBe(true);

    expect(
      isSelfReferral({
        affiliateEmail: 'a@test.com',
        affiliateCpf: '12345678901',
        affiliateAuthUserId: 'user-1',
        signupEmail: 'other@test.com',
        signupUserId: 'user-2',
      }),
    ).toBe(false);
  });
});

describe('affiliate-commission.util', () => {
  it('rounds 20 percent of a paid invoice', () => {
    expect(roundCommissionCents(6990, 20)).toBe(1398);
    expect(roundCommissionCents(3490, 20)).toBe(698);
  });

  it('skips trial and zero invoices', () => {
    expect(
      shouldSkipUnpaidOrTrialInvoice({ amountPaid: 0, planGrossCents: 6990 }),
    ).toBe(true);
    expect(
      shouldSkipUnpaidOrTrialInvoice({ amountPaid: 6990, planGrossCents: 0 }),
    ).toBe(true);
    expect(
      shouldSkipUnpaidOrTrialInvoice({ amountPaid: 6990, planGrossCents: 6990 }),
    ).toBe(false);
  });

  it('enforces payout minimum of 50 BRL', () => {
    expect(canIncludeInPayout(4999, 5000)).toBe(false);
    expect(canIncludeInPayout(5000, 5000)).toBe(true);
  });
});
