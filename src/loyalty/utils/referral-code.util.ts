const REFERRAL_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeReferralCode(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

export function generateReferralCode(length = 8): string {
  const normalizedLength = Math.min(Math.max(length, 6), 8);
  let code = '';

  for (let index = 0; index < normalizedLength; index += 1) {
    const charIndex = Math.floor(Math.random() * REFERRAL_CODE_CHARS.length);
    code += REFERRAL_CODE_CHARS.charAt(charIndex);
  }

  return code;
}

export function generateRandomReferralCodeLength(): number {
  return 6 + Math.floor(Math.random() * 3);
}
