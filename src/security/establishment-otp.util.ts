import { createHash, randomInt } from 'crypto';
import { normalizeEstablishmentOtpCode } from './establishment-email-verification.util';

export const ESTABLISHMENT_OTP_LENGTH = 6;
export const ESTABLISHMENT_OTP_TTL_MS = 60 * 60 * 1000;
export const ESTABLISHMENT_OTP_MAX_ATTEMPTS = 5;
export const ESTABLISHMENT_OTP_HASH_KEY = 'establishment_otp_hash';
export const ESTABLISHMENT_OTP_EXPIRES_AT_KEY = 'establishment_otp_expires_at';
export const ESTABLISHMENT_OTP_ATTEMPTS_KEY = 'establishment_otp_attempts';

export function generateEstablishmentOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(ESTABLISHMENT_OTP_LENGTH, '0');
}

export function hashEstablishmentOtp(userId: string, code: string): string {
  return createHash('sha256')
    .update(`${userId}:${normalizeEstablishmentOtpCode(code)}`)
    .digest('hex');
}

export function isEstablishmentOtpExpired(
  expiresAt: unknown,
  now = new Date(),
): boolean {
  if (typeof expiresAt !== 'string' || !expiresAt.trim()) {
    return true;
  }

  const timestamp = Date.parse(expiresAt);

  return Number.isNaN(timestamp) || timestamp <= now.getTime();
}

export function readEstablishmentOtpAttempts(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }

  return 0;
}
