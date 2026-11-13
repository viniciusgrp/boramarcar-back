import type { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import type { PlanTier } from '../../tenants/entities/plan-tier.type';

const ENV_BY_TIER: Record<PlanTier, string> = {
  SOLO: 'ASAAS_SOLO_VALUE_BRL',
  PRO: 'ASAAS_PRO_VALUE_BRL',
  ELITE: 'ASAAS_ELITE_VALUE_BRL',
};

export function parseBrlAmount(raw: string | undefined, envKey: string): number {
  const normalized = raw?.trim().replace(',', '.');
  const value = normalized ? Number.parseFloat(normalized) : Number.NaN;

  if (!Number.isFinite(value) || value <= 0) {
    throw new InternalServerErrorException(`${envKey} is not configured`);
  }

  return Math.round(value * 100) / 100;
}

export function resolvePlanValueBrl(
  configService: ConfigService,
  planTier: PlanTier,
): number {
  const envKey = ENV_BY_TIER[planTier];
  return parseBrlAmount(configService.get<string>(envKey), envKey);
}

export function resolveSupportAiValueBrl(configService: ConfigService): number {
  return parseBrlAmount(
    configService.get<string>('ASAAS_SUPPORT_AI_VALUE_BRL'),
    'ASAAS_SUPPORT_AI_VALUE_BRL',
  );
}

export function resolvePlanTierFromValue(
  value: number | undefined,
  valuesByTier: Record<PlanTier, number>,
): PlanTier | null {
  if (!Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.round((value as number) * 100) / 100;

  for (const tier of ['SOLO', 'PRO', 'ELITE'] as const) {
    if (valuesByTier[tier] === rounded) {
      return tier;
    }
  }

  return null;
}
