import { LOYALTY_BOOKING_REDEEM_PREFIX } from './loyalty-ledger.constants';
import {
  parseRewardTitleFromRedemptionDescription,
  resolveRedemptionSource,
} from './loyalty-redemption-description.util';

describe('loyalty-redemption-description.util', () => {
  it('parses booking redemptions', () => {
    const description = `${LOYALTY_BOOKING_REDEEM_PREFIX} Corte grátis`;
    expect(parseRewardTitleFromRedemptionDescription(description)).toBe(
      'Corte grátis',
    );
    expect(resolveRedemptionSource(description)).toBe('booking');
  });
});
