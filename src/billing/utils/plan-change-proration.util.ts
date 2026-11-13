import type { PlanTier } from '../../tenants/entities/plan-tier.type';
import { addCalendarMonths, toAsaasDate } from './billing-grace.util';

/** Asaas rejects one-off charges below this amount. */
export const ASAAS_MIN_CHARGE_BRL = 5;

export type PlanChangeDirection = 'upgrade' | 'downgrade' | 'same';

export function roundBrl(value: number): number {
  return Math.round(value * 100) / 100;
}

export function planTierLabel(planTier: PlanTier): string {
  switch (planTier) {
    case 'SOLO':
      return 'Solo';
    case 'PRO':
      return 'Pro';
    case 'ELITE':
      return 'Elite';
  }
}

export function calendarDaysBetween(startDate: string, endDate: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return 0;
  }

  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
  const diffMs =
    Date.UTC(endYear, endMonth - 1, endDay) -
    Date.UTC(startYear, startMonth - 1, startDay);

  return Math.round(diffMs / 86_400_000);
}

export interface PaidPeriodDates {
  periodStartDate: string;
  periodEndDate: string;
  todayDate: string;
}

export function paidPeriodDates(
  expiresAtIso: string,
  now: Date,
): PaidPeriodDates | null {
  const periodStart = addCalendarMonths(expiresAtIso, -1);
  const expiresAt = new Date(expiresAtIso);

  if (!periodStart || Number.isNaN(expiresAt.getTime())) {
    return null;
  }

  return {
    periodStartDate: toAsaasDate(periodStart),
    periodEndDate: toAsaasDate(expiresAt),
    todayDate: toAsaasDate(now),
  };
}

export interface PlanChangeQuote {
  direction: PlanChangeDirection;
  currentMonthlyValueBrl: number;
  targetMonthlyValueBrl: number;
  proratedAmountBrl: number | null;
  chargeAmountBrl: number;
  belowAsaasMinimum: boolean;
  daysInPeriod: number | null;
  remainingDays: number | null;
}

export function quotePlanChange(params: {
  currentMonthlyValueBrl: number;
  targetMonthlyValueBrl: number;
  periodStartDate?: string | null;
  periodEndDate?: string | null;
  todayDate?: string | null;
}): PlanChangeQuote {
  const currentMonthlyValueBrl = roundBrl(params.currentMonthlyValueBrl);
  const targetMonthlyValueBrl = roundBrl(params.targetMonthlyValueBrl);
  const direction: PlanChangeDirection =
    targetMonthlyValueBrl > currentMonthlyValueBrl
      ? 'upgrade'
      : targetMonthlyValueBrl < currentMonthlyValueBrl
        ? 'downgrade'
        : 'same';

  if (direction !== 'upgrade') {
    return {
      direction,
      currentMonthlyValueBrl,
      targetMonthlyValueBrl,
      proratedAmountBrl: null,
      chargeAmountBrl: 0,
      belowAsaasMinimum: false,
      daysInPeriod: null,
      remainingDays: null,
    };
  }

  const daysInPeriod = calendarDaysBetween(
    params.periodStartDate ?? '',
    params.periodEndDate ?? '',
  );
  let remainingDays = calendarDaysBetween(
    params.todayDate ?? '',
    params.periodEndDate ?? '',
  );

  if (daysInPeriod > 0 && remainingDays > daysInPeriod) {
    remainingDays = daysInPeriod;
  }

  const proratedAmountBrl =
    daysInPeriod > 0 && remainingDays > 0
      ? roundBrl(
          ((targetMonthlyValueBrl - currentMonthlyValueBrl) * remainingDays) /
            daysInPeriod,
        )
      : 0;
  const belowAsaasMinimum =
    proratedAmountBrl > 0 && proratedAmountBrl < ASAAS_MIN_CHARGE_BRL;

  return {
    direction,
    currentMonthlyValueBrl,
    targetMonthlyValueBrl,
    proratedAmountBrl,
    chargeAmountBrl: belowAsaasMinimum ? 0 : proratedAmountBrl,
    belowAsaasMinimum,
    daysInPeriod: daysInPeriod > 0 ? daysInPeriod : null,
    remainingDays,
  };
}
