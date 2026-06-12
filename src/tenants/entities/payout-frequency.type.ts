export type PayoutFrequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

export const PAYOUT_FREQUENCIES: PayoutFrequency[] = [
  'DAILY',
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
];

export const DEFAULT_PAYOUT_FREQUENCY: PayoutFrequency = 'WEEKLY';

export function normalizePayoutFrequency(
  value: PayoutFrequency | string | null | undefined,
): PayoutFrequency {
  if (
    value === 'DAILY' ||
    value === 'WEEKLY' ||
    value === 'BIWEEKLY' ||
    value === 'MONTHLY'
  ) {
    return value;
  }

  return DEFAULT_PAYOUT_FREQUENCY;
}
