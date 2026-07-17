export function normalizeProfessionalPhoneDigits(
  phone?: string | null,
): string {
  return (phone ?? '').replace(/\D/g, '');
}

export function professionalPhonesMatch(
  left?: string | null,
  right?: string | null,
): boolean {
  const leftDigits = normalizeProfessionalPhoneDigits(left);
  const rightDigits = normalizeProfessionalPhoneDigits(right);

  if (!leftDigits || !rightDigits) {
    return false;
  }

  return leftDigits === rightDigits;
}
