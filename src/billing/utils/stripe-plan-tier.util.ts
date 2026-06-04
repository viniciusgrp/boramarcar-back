import type { ConfigService } from '@nestjs/config';
import type { PlanTier } from '../../tenants/entities/plan-tier.type';

export interface StripePriceTierMap {
  SOLO: string[];
  PRO: string[];
  ELITE: string[];
}

export function buildStripePriceTierMap(
  configService: ConfigService,
): StripePriceTierMap {
  const read = (key: string): string | undefined =>
    configService.get<string>(key)?.trim() || undefined;

  const soloIds = [read('STRIPE_SOLO_PRICE_ID'), read('STRIPE_PRO_PRICE_ID')].filter(
    (id): id is string => Boolean(id),
  );

  const proIds = [read('STRIPE_PRO_TIER_PRICE_ID')].filter((id): id is string =>
    Boolean(id),
  );

  const eliteIds = [read('STRIPE_ELITE_PRICE_ID')].filter((id): id is string =>
    Boolean(id),
  );

  return {
    SOLO: [...new Set(soloIds)],
    PRO: [...new Set(proIds)],
    ELITE: [...new Set(eliteIds)],
  };
}

export function resolvePlanTierFromPriceId(
  priceId: string | null | undefined,
  priceMap: StripePriceTierMap,
): PlanTier | null {
  if (!priceId?.trim()) {
    return null;
  }

  const normalized = priceId.trim();

  if (priceMap.ELITE.includes(normalized)) {
    return 'ELITE';
  }

  if (priceMap.PRO.includes(normalized)) {
    return 'PRO';
  }

  if (priceMap.SOLO.includes(normalized)) {
    return 'SOLO';
  }

  return null;
}
