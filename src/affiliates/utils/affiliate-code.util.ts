const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeAffiliateCode(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function generateAffiliateCode(randomBytes: () => number = Math.random): string {
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    const index = Math.floor(randomBytes() * CODE_ALPHABET.length);
    suffix += CODE_ALPHABET[index];
  }
  return `BM${suffix}`;
}

export function isSelfReferral(params: {
  affiliateEmail: string;
  affiliateCpf: string;
  affiliateAuthUserId: string;
  signupEmail?: string | null;
  signupUserId?: string | null;
  signupCpf?: string | null;
}): boolean {
  const affiliateEmail = params.affiliateEmail.trim().toLowerCase();
  const signupEmail = params.signupEmail?.trim().toLowerCase() ?? '';
  if (signupEmail && affiliateEmail && signupEmail === affiliateEmail) {
    return true;
  }

  const affiliateCpf = params.affiliateCpf.replace(/\D/g, '');
  const signupCpf = params.signupCpf?.replace(/\D/g, '') ?? '';
  if (signupCpf && affiliateCpf && signupCpf === affiliateCpf) {
    return true;
  }

  const signupUserId = params.signupUserId?.trim() ?? '';
  if (signupUserId && signupUserId === params.affiliateAuthUserId) {
    return true;
  }

  return false;
}
