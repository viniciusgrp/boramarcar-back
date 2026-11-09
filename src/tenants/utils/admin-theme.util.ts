import type { PlanTier } from '../entities/plan-tier.type';

export const DEFAULT_ADMIN_SECONDARY_COLOR_LIGHT = '#4338ca';
export const DEFAULT_ADMIN_SECONDARY_COLOR_DARK = '#818cf8';

export function canCustomizeAdminThemeColors(planTier: PlanTier): boolean {
  return planTier === 'PRO' || planTier === 'ELITE';
}

export function normalizeAdminThemeColor(
  value: string | null | undefined,
  fallback: string,
): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(trimmed) ? trimmed : fallback;
}
