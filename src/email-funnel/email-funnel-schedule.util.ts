import { EMAIL_FUNNEL_TIME_ZONE } from './email-funnel.types';
import type { EmailFunnelTriggerType } from './email-funnel.types';

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function getZonedParts(
  date: Date,
  timeZone: string = EMAIL_FUNNEL_TIME_ZONE,
): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const read = (type: string): number => {
    const value = parts.find((part) => part.type === type)?.value;
    return Number.parseInt(value ?? '0', 10);
  };

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  };
}

export function zonedDateTimeToUtc(
  parts: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute?: number;
  },
  timeZone: string = EMAIL_FUNNEL_TIME_ZONE,
): Date {
  const minute = parts.minute ?? 0;
  const iso = `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  let guess = new Date(`${iso}Z`);
  const desiredUtcMinutes = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    minute,
  );

  for (let index = 0; index < 4; index += 1) {
    const zoned = getZonedParts(guess, timeZone);
    const actualUtcMinutes = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
    );
    const deltaMs = desiredUtcMinutes - actualUtcMinutes;
    if (deltaMs === 0) {
      break;
    }
    guess = new Date(guess.getTime() + deltaMs);
  }

  return guess;
}

export function addCalendarDays(
  parts: Pick<ZonedParts, 'year' | 'month' | 'day'>,
  days: number,
): { year: number; month: number; day: number } {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day + days);
  const date = new Date(utc);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function isEmailFunnelStepDue(params: {
  now: Date;
  signupAt: Date;
  trialEndsAt: Date | null;
  triggerType: EmailFunnelTriggerType;
  triggerOffset: number;
  sendHour: number | null;
  windowStartHour: number | null;
  windowEndHour: number | null;
  timeZone?: string;
}): boolean {
  const timeZone = params.timeZone ?? EMAIL_FUNNEL_TIME_ZONE;
  const dueAt = resolveDueAt(params, timeZone);
  if (!dueAt) {
    return false;
  }
  return params.now.getTime() >= dueAt.getTime();
}

function resolveDueAt(
  params: {
    now: Date;
    signupAt: Date;
    trialEndsAt: Date | null;
    triggerType: EmailFunnelTriggerType;
    triggerOffset: number;
    sendHour: number | null;
    windowStartHour: number | null;
    windowEndHour: number | null;
  },
  timeZone: string,
): Date | null {
  if (params.triggerType === 'immediate') {
    return params.signupAt;
  }

  if (params.triggerType === 'hours_after_signup') {
    const rawDue = new Date(
      params.signupAt.getTime() + params.triggerOffset * 60 * 60 * 1000,
    );
    return applySendWindow(rawDue, params.windowStartHour, params.windowEndHour, timeZone);
  }

  if (params.triggerType === 'days_after_signup') {
    const signup = getZonedParts(params.signupAt, timeZone);
    const targetDay = addCalendarDays(signup, params.triggerOffset);
    const hour = params.sendHour ?? 10;
    return zonedDateTimeToUtc(
      { ...targetDay, hour, minute: 0 },
      timeZone,
    );
  }

  if (params.triggerType === 'days_before_trial_end') {
    if (!params.trialEndsAt) {
      return null;
    }
    const end = getZonedParts(params.trialEndsAt, timeZone);
    const targetDay = addCalendarDays(end, -params.triggerOffset);
    const hour = params.sendHour ?? 10;
    return zonedDateTimeToUtc(
      { ...targetDay, hour, minute: 0 },
      timeZone,
    );
  }

  return null;
}

function applySendWindow(
  date: Date,
  windowStartHour: number | null,
  windowEndHour: number | null,
  timeZone: string,
): Date {
  if (windowStartHour == null || windowEndHour == null) {
    return date;
  }

  const parts = getZonedParts(date, timeZone);

  if (parts.hour < windowStartHour) {
    return zonedDateTimeToUtc(
      {
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: windowStartHour,
        minute: 0,
      },
      timeZone,
    );
  }

  if (parts.hour >= windowEndHour) {
    const next = addCalendarDays(parts, 1);
    return zonedDateTimeToUtc(
      { ...next, hour: windowStartHour, minute: 0 },
      timeZone,
    );
  }

  return date;
}
