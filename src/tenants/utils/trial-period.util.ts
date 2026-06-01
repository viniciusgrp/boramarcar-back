import { addDays } from 'date-fns';

export const TRIAL_DURATION_DAYS = 14;

export interface TrialPeriod {
  trialStartsAt: string;
  trialEndsAt: string;
}

/** Returns trial window as UTC ISO strings (timestamptz-safe). */
export function buildTrialPeriod(
  referenceDate: Date = new Date(),
): TrialPeriod {
  const trialStartsAt = referenceDate.toISOString();
  const trialEndsAt = addDays(referenceDate, TRIAL_DURATION_DAYS).toISOString();

  return { trialStartsAt, trialEndsAt };
}
