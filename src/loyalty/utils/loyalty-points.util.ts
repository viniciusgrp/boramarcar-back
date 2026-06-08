export function calculateEarnedPoints(
  totalPrice: number,
  pointsPerCurrency: number,
): number {
  const safeTotal = Number.isFinite(totalPrice) ? totalPrice : 0;
  const safeRate = Number.isFinite(pointsPerCurrency) ? pointsPerCurrency : 0;

  if (safeTotal <= 0 || safeRate <= 0) {
    return 0;
  }

  return Math.floor(safeTotal * safeRate);
}

export function normalizePhoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}
