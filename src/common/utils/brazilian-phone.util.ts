/** Strips non-digits and normalizes optional country code 55. */
export function extractBrazilianPhoneDigits(value: string): string {
  let digits = value.replace(/\D/g, '');

  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }

  return digits.slice(0, 11);
}

/** True when empty (optional) or 10/11 national digits with valid mobile prefix. */
export function isValidBrazilianPhone(
  value: string,
  options?: { required?: boolean },
): boolean {
  const digits = extractBrazilianPhoneDigits(value);

  if (digits.length === 0) {
    return !options?.required;
  }

  if (digits.length === 10) {
    return true;
  }

  if (digits.length === 11) {
    return digits[2] === '9';
  }

  return false;
}
