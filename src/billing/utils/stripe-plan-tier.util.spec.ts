import type { ConfigService } from '@nestjs/config';
import {
  buildStripePriceTierMap,
  resolvePlanTierFromPriceId,
} from './stripe-plan-tier.util';

describe('stripe-plan-tier.util', () => {
  it('maps configured price ids to plan tiers', () => {
    const config = {
      get: (key: string) =>
        ({
          STRIPE_SOLO_PRICE_ID: 'price_solo',
          STRIPE_PRO_PRICE_ID: 'price_legacy_pro',
          STRIPE_PRO_TIER_PRICE_ID: 'price_pro',
          STRIPE_ELITE_PRICE_ID: 'price_elite',
        })[key],
    } as unknown as ConfigService;

    const map = buildStripePriceTierMap(config);

    expect(resolvePlanTierFromPriceId('price_elite', map)).toBe('ELITE');
    expect(resolvePlanTierFromPriceId('price_pro', map)).toBe('PRO');
    expect(resolvePlanTierFromPriceId('price_solo', map)).toBe('SOLO');
    expect(resolvePlanTierFromPriceId('price_unknown', map)).toBeNull();
  });
});
