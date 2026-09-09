import {
  generateEstablishmentOtp,
  hashEstablishmentOtp,
  isEstablishmentOtpExpired,
  readEstablishmentOtpAttempts,
} from './establishment-otp.util';

describe('establishment-otp.util', () => {
  it('generates a 6-digit numeric code', () => {
    const codes = new Set(
      Array.from({ length: 20 }, () => generateEstablishmentOtp()),
    );

    for (const code of codes) {
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('hashes the same user and code to the same digest', () => {
    const hash = hashEstablishmentOtp('user-1', '12 34 56');
    expect(hashEstablishmentOtp('user-1', '123456')).toBe(hash);
    expect(hashEstablishmentOtp('user-2', '123456')).not.toBe(hash);
  });

  it('treats missing or past expiry as expired', () => {
    expect(isEstablishmentOtpExpired(null)).toBe(true);
    expect(isEstablishmentOtpExpired('2020-01-01T00:00:00.000Z')).toBe(true);
    expect(
      isEstablishmentOtpExpired(
        new Date(Date.now() + 60_000).toISOString(),
      ),
    ).toBe(false);
  });

  it('reads attempt counts from number or numeric string', () => {
    expect(readEstablishmentOtpAttempts(2)).toBe(2);
    expect(readEstablishmentOtpAttempts('3')).toBe(3);
    expect(readEstablishmentOtpAttempts(undefined)).toBe(0);
  });
});
