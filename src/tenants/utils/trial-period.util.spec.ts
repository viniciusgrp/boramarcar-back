import { addDays } from 'date-fns';
import {
  TRIAL_DEFAULT_PLAN_TIER,
  TRIAL_DURATION_DAYS,
  buildTrialPeriod,
} from './trial-period.util';

describe('trial-period.util', () => {
  it('builds a 14-day UTC window from the reference date', () => {
    const reference = new Date('2026-09-08T12:00:00.000Z');
    const period = buildTrialPeriod(reference);

    expect(period.trialStartsAt).toBe(reference.toISOString());
    expect(period.trialEndsAt).toBe(addDays(reference, TRIAL_DURATION_DAYS).toISOString());
    expect(TRIAL_DURATION_DAYS).toBe(14);
    expect(TRIAL_DEFAULT_PLAN_TIER).toBe('PRO');
  });
});
