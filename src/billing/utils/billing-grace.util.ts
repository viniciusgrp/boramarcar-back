import { APP_TIME_ZONE } from '../../common/app-time-zone';

export const BILLING_GRACE_DAYS = 5;
export const BILLING_TIME_ZONE = APP_TIME_ZONE;

interface BillingZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function parseInstant(value: string | null | undefined): Date | null {
  if (!value?.trim()) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function readPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): number {
  const value = Number.parseInt(
    parts.find((part) => part.type === type)?.value ?? '0',
    10,
  );

  return Number.isFinite(value) ? value : 0;
}

function billingZonedParts(value: Date): BillingZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BILLING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);

  let hour = readPart(parts, 'hour');

  if (hour === 24) {
    hour = 0;
  }

  return {
    year: readPart(parts, 'year'),
    month: readPart(parts, 'month'),
    day: readPart(parts, 'day'),
    hour,
    minute: readPart(parts, 'minute'),
    second: readPart(parts, 'second'),
  };
}

function billingZonedDateTimeToUtc(parts: BillingZonedParts): Date {
  const iso = `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}`;
  let guess = new Date(`${iso}Z`);
  const desired = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  for (let index = 0; index < 4; index += 1) {
    const zoned = billingZonedParts(guess);
    const actual = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second,
    );
    const deltaMs = desired - actual;

    if (deltaMs === 0) {
      break;
    }

    guess = new Date(guess.getTime() + deltaMs);
  }

  return guess;
}

function shiftCalendarDate(
  year: number,
  month: number,
  day: number,
  days: number,
): { year: number; month: number; day: number } {
  const shifted = new Date(Date.UTC(year, month - 1, day + days));

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function shiftCalendarMonths(
  year: number,
  month: number,
  day: number,
  months: number,
): { year: number; month: number; day: number } {
  const monthIndex = month - 1 + months;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonthIndex = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(
    Date.UTC(targetYear, targetMonthIndex + 1, 0),
  ).getUTCDate();

  return {
    year: targetYear,
    month: targetMonthIndex + 1,
    day: Math.min(day, lastDay),
  };
}

function padDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addCalendarDays(
  value: string | Date,
  days: number,
): Date | null {
  const date =
    value instanceof Date ? new Date(value.getTime()) : parseInstant(value);

  if (!date) {
    return null;
  }

  const parts = billingZonedParts(date);
  const shifted = shiftCalendarDate(parts.year, parts.month, parts.day, days);

  return billingZonedDateTimeToUtc({
    ...parts,
    ...shifted,
  });
}

export function isWithinGraceWindow(
  referenceIso: string | null | undefined,
  now: Date = new Date(),
  days: number = BILLING_GRACE_DAYS,
): boolean {
  if (!referenceIso?.trim()) {
    return false;
  }

  const until = addCalendarDays(referenceIso, days);

  if (!until) {
    return false;
  }

  return now.getTime() <= until.getTime();
}

export function hasPendingTrialPaymentGrace(
  tenant: {
    asaas_pending_payment_id?: string | null;
    trial_ends_at?: string | null;
  },
  now: Date = new Date(),
): boolean {
  if (!tenant.asaas_pending_payment_id?.trim()) {
    return false;
  }

  return isWithinGraceWindow(tenant.trial_ends_at, now);
}

export function isPaidSubscriptionGraceExpired(
  tenant: {
    subscription_expires_at?: string | null;
  },
  now: Date = new Date(),
): boolean {
  const expiresAt = parseInstant(tenant.subscription_expires_at);

  if (!expiresAt) {
    return false;
  }

  const until = addCalendarDays(expiresAt, BILLING_GRACE_DAYS);

  if (!until) {
    return false;
  }

  return now.getTime() > until.getTime();
}

/** Calendar date in America/Sao_Paulo, sent to Asaas as YYYY-MM-DD. */
export function toAsaasDate(value: Date): string {
  const parts = billingZonedParts(value);
  return padDate(parts.year, parts.month, parts.day);
}

export function addCalendarMonths(
  value: string | Date,
  months: number,
): Date | null {
  const date =
    value instanceof Date ? new Date(value.getTime()) : parseInstant(value);

  if (!date) {
    return null;
  }

  const parts = billingZonedParts(date);
  const shifted = shiftCalendarMonths(
    parts.year,
    parts.month,
    parts.day,
    months,
  );

  return billingZonedDateTimeToUtc({
    ...parts,
    ...shifted,
  });
}

/** Asaas YYYY-MM-DD is a Sao Paulo calendar date, stored as that local midnight. */
export function asaasDateToIso(
  value: string | null | undefined,
): string | null {
  const dateOnly = value?.trim().slice(0, 10) ?? '';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return null;
  }

  const [year, month, day] = dateOnly.split('-').map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return billingZonedDateTimeToUtc({
    year,
    month,
    day,
    hour: 0,
    minute: 0,
    second: 0,
  }).toISOString();
}

export function isIsoInstantAfter(
  next: string | null | undefined,
  current: string | null | undefined,
): boolean {
  const nextMs = parseInstant(next)?.getTime();

  if (nextMs === undefined) {
    return false;
  }

  const currentMs = parseInstant(current)?.getTime();

  if (currentMs === undefined) {
    return true;
  }

  return nextMs > currentMs;
}

export function laterIsoInstant(
  current: string | null | undefined,
  next: string | null | undefined,
): string | null {
  const currentValue = current?.trim() || null;
  const nextValue = next?.trim() || null;

  if (!nextValue) {
    return currentValue;
  }

  if (!currentValue || isIsoInstantAfter(nextValue, currentValue)) {
    return nextValue;
  }

  return currentValue;
}

export function periodEndFromPaidChargeDate(
  value: string | null | undefined,
): string | null {
  const dateOnly = value?.trim().slice(0, 10);

  if (!dateOnly || !/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return null;
  }

  const [year, month, day] = dateOnly.split('-').map(Number);
  const next = shiftCalendarMonths(year, month, day, 1);

  return asaasDateToIso(padDate(next.year, next.month, next.day));
}
