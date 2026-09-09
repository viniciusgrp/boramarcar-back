import {
  buildEstablishmentVerificationCallbackUrl,
  isSixDigitOtp,
  normalizeEstablishmentOtpCode,
  requiresEstablishmentEmailVerification,
} from './establishment-email-verification.util';

describe('establishment-email-verification.util', () => {
  it('builds the callback URL with token hash and intent', () => {
    expect(
      buildEstablishmentVerificationCallbackUrl(
        'https://boramarcar.com.br/',
        'abc+hash',
        'magiclink',
      ),
    ).toBe(
      'https://boramarcar.com.br/auth/callback?token_hash=abc%2Bhash&type=magiclink&intent=tenant-register',
    );
  });

  it('accepts only 6 numeric digits', () => {
    expect(isSixDigitOtp('123456')).toBe(true);
    expect(isSixDigitOtp('12 34 56')).toBe(true);
    expect(isSixDigitOtp('12345')).toBe(false);
    expect(isSixDigitOtp('1234567')).toBe(false);
    expect(isSixDigitOtp('12ab56')).toBe(false);
  });

  it('normalizes spaces in the typed code', () => {
    expect(normalizeEstablishmentOtpCode('12 34 56')).toBe('123456');
  });

  it('blocks only new signups pending confirmation', () => {
    expect(
      requiresEstablishmentEmailVerification({
        email_confirmed_at: null,
        user_metadata: { requires_email_verification: true },
      }),
    ).toBe(true);

    expect(
      requiresEstablishmentEmailVerification({
        email_confirmed_at: '2026-01-01T00:00:00Z',
        user_metadata: { requires_email_verification: true },
      }),
    ).toBe(false);

    expect(
      requiresEstablishmentEmailVerification({
        email_confirmed_at: null,
        user_metadata: {},
      }),
    ).toBe(false);
  });
});
