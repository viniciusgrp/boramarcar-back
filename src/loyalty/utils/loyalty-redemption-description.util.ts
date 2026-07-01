import type { LoyaltyRedemptionSource } from '../entities/loyalty-redemption-history.entity';

const BOOKING_PREFIX = 'Resgate no agendamento: ';
const STANDALONE_PREFIX = 'Resgate: ';

export function parseRewardTitleFromRedemptionDescription(
  description: string,
): string {
  if (description.startsWith(BOOKING_PREFIX)) {
    return description.slice(BOOKING_PREFIX.length).trim();
  }

  if (description.startsWith(STANDALONE_PREFIX)) {
    return description.slice(STANDALONE_PREFIX.length).trim();
  }

  return description.trim();
}

export function resolveRedemptionSource(
  description: string,
): LoyaltyRedemptionSource {
  return description.startsWith('Resgate no agendamento:')
    ? 'booking'
    : 'standalone';
}
