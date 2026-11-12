export const BILLING_GRACE_DAYS = 5;

function parseInstant(value: string | null | undefined): Date | null {
  if (!value?.trim()) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function addCalendarDays(
  value: string | Date,
  days: number,
): Date | null {
  const date =
    value instanceof Date
      ? new Date(value.getTime())
      : parseInstant(typeof value === 'string' ? value : null);

  if (!date) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() + days);
  return date;
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

export function toAsaasDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addCalendarMonths(
  value: string | Date,
  months: number,
): Date | null {
  const date =
    value instanceof Date
      ? new Date(value.getTime())
      : parseInstant(typeof value === 'string' ? value : null);

  if (!date) {
    return null;
  }

  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date;
}

export function periodEndFromPaidChargeDate(
  value: string | null | undefined,
): string | null {
  const dateOnly = value?.trim().slice(0, 10);

  if (!dateOnly || !/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return null;
  }

  return addCalendarMonths(`${dateOnly}T00:00:00.000Z`, 1)?.toISOString() ?? null;
}
