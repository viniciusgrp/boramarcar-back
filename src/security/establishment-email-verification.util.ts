export const REQUIRES_EMAIL_VERIFICATION_METADATA_KEY =
  'requires_email_verification';

export function buildEstablishmentVerificationCallbackUrl(
  frontendUrl: string,
  hashedToken: string,
  otpType: string,
): string {
  const origin = frontendUrl.replace(/\/+$/, '');
  const params = new URLSearchParams({
    token_hash: hashedToken,
    type: otpType,
    intent: 'tenant-register',
  });

  return `${origin}/auth/callback?${params.toString()}`;
}

export function normalizeEstablishmentOtpCode(value: string): string {
  return value.replace(/\D/g, '');
}

export function isSixDigitOtp(value: string): boolean {
  return /^\d{6}$/.test(normalizeEstablishmentOtpCode(value));
}

export function requiresEstablishmentEmailVerification(
  user:
    | {
        email_confirmed_at?: string | null;
        user_metadata?: Record<string, unknown> | null;
      }
    | null
    | undefined,
): boolean {
  if (!user) {
    return false;
  }

  if (user.email_confirmed_at) {
    return false;
  }

  return user.user_metadata?.[REQUIRES_EMAIL_VERIFICATION_METADATA_KEY] === true;
}
