import type { LoyaltyRedemptionSource } from '../entities/loyalty-redemption-history.entity';
import {
  isBookingRedeemDescription,
  LOYALTY_BOOKING_REDEEM_PREFIX,
  LOYALTY_STANDALONE_REDEEM_PREFIX,
} from './loyalty-ledger.constants';

export function parseRewardTitleFromRedemptionDescription(
  description: string,
): string {
  if (description.startsWith(LOYALTY_BOOKING_REDEEM_PREFIX)) {
    return description.slice(LOYALTY_BOOKING_REDEEM_PREFIX.length).trim();
  }

  if (description.startsWith(LOYALTY_STANDALONE_REDEEM_PREFIX)) {
    return description.slice(LOYALTY_STANDALONE_REDEEM_PREFIX.length).trim();
  }

  return description.trim();
}

export function resolveRedemptionSource(
  description: string,
): LoyaltyRedemptionSource {
  return isBookingRedeemDescription(description) ? 'booking' : 'standalone';
}
