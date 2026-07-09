import { InternalServerErrorException } from '@nestjs/common';

export function normalizeApplicationFeePercent(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (parsed < 0) {
    return 0;
  }

  if (parsed > 100) {
    throw new InternalServerErrorException(
      'Application fee percent must be between 0 and 100',
    );
  }

  return parsed;
}

export function resolveTenantDepositApplicationFeePercent(
  tenantOverride: number | null | undefined,
  defaultPercent: number,
): number {
  if (tenantOverride !== null && tenantOverride !== undefined) {
    return normalizeApplicationFeePercent(tenantOverride) ?? 0;
  }

  return normalizeApplicationFeePercent(defaultPercent) ?? 0;
}

export function resolveConnectApplicationFeeAmount(
  unitAmountCents: number,
  feePercent: number,
): number {
  if (feePercent <= 0) {
    return 0;
  }

  return Math.round(unitAmountCents * (feePercent / 100));
}
