import {
  isEmailFunnelStepDue,
  resolveEmailFunnelStepDueStatus,
} from './email-funnel-schedule.util';

describe('isEmailFunnelStepDue', () => {
  const timeZone = 'America/Sao_Paulo';

  it('marks the welcome email as due immediately after signup', () => {
    const signupAt = new Date('2026-09-08T17:00:00.000Z');
    expect(
      isEmailFunnelStepDue({
        now: signupAt,
        signupAt,
        trialEndsAt: new Date('2026-09-22T17:00:00.000Z'),
        triggerType: 'immediate',
        triggerOffset: 0,
        sendHour: null,
        windowStartHour: null,
        windowEndHour: null,
        timeZone,
      }),
    ).toBe(true);
  });

  it('keeps immediate steps due even when far past signup (no lateness cap)', () => {
    const signupAt = new Date('2026-09-08T17:00:00.000Z');
    const weeksLater = new Date('2026-10-01T17:00:00.000Z');
    expect(
      isEmailFunnelStepDue({
        now: weeksLater,
        signupAt,
        trialEndsAt: new Date('2026-09-22T17:00:00.000Z'),
        triggerType: 'immediate',
        triggerOffset: 0,
        sendHour: null,
        windowStartHour: null,
        windowEndHour: null,
        timeZone,
      }),
    ).toBe(true);
    expect(
      resolveEmailFunnelStepDueStatus({
        now: weeksLater,
        signupAt,
        trialEndsAt: new Date('2026-09-22T17:00:00.000Z'),
        triggerType: 'immediate',
        triggerOffset: 0,
        sendHour: null,
        windowStartHour: null,
        windowEndHour: null,
        timeZone,
      }),
    ).toBe('due');
  });

  it('holds the 18h nudge until the 9-20 local window', () => {
    const signupAt = new Date('2026-09-08T06:00:00.000Z');
    const eighteenHoursLater = new Date('2026-09-09T00:00:00.000Z');
    expect(
      isEmailFunnelStepDue({
        now: eighteenHoursLater,
        signupAt,
        trialEndsAt: null,
        triggerType: 'hours_after_signup',
        triggerOffset: 18,
        sendHour: null,
        windowStartHour: 9,
        windowEndHour: 20,
        timeZone,
      }),
    ).toBe(false);

    const afterWindowOpens = new Date('2026-09-09T12:05:00.000Z');
    expect(
      isEmailFunnelStepDue({
        now: afterWindowOpens,
        signupAt,
        trialEndsAt: null,
        triggerType: 'hours_after_signup',
        triggerOffset: 18,
        sendHour: null,
        windowStartHour: 9,
        windowEndHour: 20,
        timeZone,
      }),
    ).toBe(true);
  });

  it('fires D+2 at 10:00 America/Sao_Paulo', () => {
    const signupAt = new Date('2026-09-08T17:00:00.000Z');
    const before = new Date('2026-09-10T12:50:00.000Z');
    const after = new Date('2026-09-10T13:05:00.000Z');

    expect(
      isEmailFunnelStepDue({
        now: before,
        signupAt,
        trialEndsAt: null,
        triggerType: 'days_after_signup',
        triggerOffset: 2,
        sendHour: 10,
        windowStartHour: null,
        windowEndHour: null,
        timeZone,
      }),
    ).toBe(false);

    expect(
      isEmailFunnelStepDue({
        now: after,
        signupAt,
        trialEndsAt: null,
        triggerType: 'days_after_signup',
        triggerOffset: 2,
        sendHour: 10,
        windowStartHour: null,
        windowEndHour: null,
        timeZone,
      }),
    ).toBe(true);
  });

  it('fires two calendar days before trial end at 10:00 local', () => {
    const trialEndsAt = new Date('2026-09-22T17:00:00.000Z');
    const tooEarly = new Date('2026-09-20T12:50:00.000Z');
    const due = new Date('2026-09-20T13:05:00.000Z');

    expect(
      isEmailFunnelStepDue({
        now: tooEarly,
        signupAt: new Date('2026-09-08T17:00:00.000Z'),
        trialEndsAt,
        triggerType: 'days_before_trial_end',
        triggerOffset: 2,
        sendHour: 10,
        windowStartHour: null,
        windowEndHour: null,
        timeZone,
      }),
    ).toBe(false);

    expect(
      isEmailFunnelStepDue({
        now: due,
        signupAt: new Date('2026-09-08T17:00:00.000Z'),
        trialEndsAt,
        triggerType: 'days_before_trial_end',
        triggerOffset: 2,
        sendHour: 10,
        windowStartHour: null,
        windowEndHour: null,
        timeZone,
      }),
    ).toBe(true);
  });

  it('fires on the last day of trial (offset 0 before trial end) at 10:00 local', () => {
    const trialEndsAt = new Date('2026-09-22T17:00:00.000Z');
    const tooEarly = new Date('2026-09-22T12:50:00.000Z');
    const due = new Date('2026-09-22T13:05:00.000Z');

    expect(
      isEmailFunnelStepDue({
        now: tooEarly,
        signupAt: new Date('2026-09-08T17:00:00.000Z'),
        trialEndsAt,
        triggerType: 'days_before_trial_end',
        triggerOffset: 0,
        sendHour: 10,
        windowStartHour: null,
        windowEndHour: null,
        timeZone,
      }),
    ).toBe(false);

    expect(
      isEmailFunnelStepDue({
        now: due,
        signupAt: new Date('2026-09-08T17:00:00.000Z'),
        trialEndsAt,
        triggerType: 'days_before_trial_end',
        triggerOffset: 0,
        sendHour: 10,
        windowStartHour: null,
        windowEndHour: null,
        timeZone,
      }),
    ).toBe(true);
  });

  it('fires trial_last_day even when trial ends before send_hour', () => {
    // Trial ends at 08:00 BRT (11:00 UTC), but send_hour is 10:00 BRT (13:00 UTC)
    // The email should still be due at 10:00 BRT on the last day
    const trialEndsAt = new Date('2026-09-22T11:00:00.000Z'); // 08:00 BRT
    const at10amBRT = new Date('2026-09-22T13:00:00.000Z'); // 10:00 BRT

    expect(
      isEmailFunnelStepDue({
        now: at10amBRT,
        signupAt: new Date('2026-09-08T17:00:00.000Z'),
        trialEndsAt,
        triggerType: 'days_before_trial_end',
        triggerOffset: 0,
        sendHour: 10,
        windowStartHour: null,
        windowEndHour: null,
        timeZone,
      }),
    ).toBe(true);
  });

  it('fires three calendar days after trial end at 10:00 local', () => {
    const trialEndsAt = new Date('2026-09-22T17:00:00.000Z');
    const tooEarly = new Date('2026-09-25T12:50:00.000Z');
    const due = new Date('2026-09-25T13:05:00.000Z');

    expect(
      isEmailFunnelStepDue({
        now: tooEarly,
        signupAt: new Date('2026-09-08T17:00:00.000Z'),
        trialEndsAt,
        triggerType: 'days_after_trial_end',
        triggerOffset: 3,
        sendHour: 10,
        windowStartHour: null,
        windowEndHour: null,
        timeZone,
      }),
    ).toBe(false);

    expect(
      isEmailFunnelStepDue({
        now: due,
        signupAt: new Date('2026-09-08T17:00:00.000Z'),
        trialEndsAt,
        triggerType: 'days_after_trial_end',
        triggerOffset: 3,
        sendHour: 10,
        windowStartHour: null,
        windowEndHour: null,
        timeZone,
      }),
    ).toBe(true);
  });

  it('still sends D+1 on-time inside the 24h lateness window', () => {
    const signupAt = new Date('2026-09-08T17:00:00.000Z');
    // D+1 at 10:00 BRT = 2026-09-09T13:00:00.000Z; 23h later is still due
    const almostStale = new Date('2026-09-10T12:00:00.000Z');

    expect(
      resolveEmailFunnelStepDueStatus({
        now: almostStale,
        signupAt,
        trialEndsAt: null,
        triggerType: 'days_after_signup',
        triggerOffset: 1,
        sendHour: 10,
        windowStartHour: null,
        windowEndHour: null,
        timeZone,
      }),
    ).toBe('due');
    expect(
      isEmailFunnelStepDue({
        now: almostStale,
        signupAt,
        trialEndsAt: null,
        triggerType: 'days_after_signup',
        triggerOffset: 1,
        sendHour: 10,
        windowStartHour: null,
        windowEndHour: null,
        timeZone,
      }),
    ).toBe(true);
  });

  it('marks D+1 as stale after the 24h lateness window', () => {
    const signupAt = new Date('2026-09-08T17:00:00.000Z');
    // dueAt = 2026-09-09T13:00:00.000Z; +24h = 2026-09-10T13:00:00.000Z
    const staleAt = new Date('2026-09-10T13:00:00.000Z');

    expect(
      resolveEmailFunnelStepDueStatus({
        now: staleAt,
        signupAt,
        trialEndsAt: null,
        triggerType: 'days_after_signup',
        triggerOffset: 1,
        sendHour: 10,
        windowStartHour: null,
        windowEndHour: null,
        timeZone,
      }),
    ).toBe('stale');
    expect(
      isEmailFunnelStepDue({
        now: staleAt,
        signupAt,
        trialEndsAt: null,
        triggerType: 'days_after_signup',
        triggerOffset: 1,
        sendHour: 10,
        windowStartHour: null,
        windowEndHour: null,
        timeZone,
      }),
    ).toBe(false);
  });

  it('marks trial_last_day as stale after the 24h lateness window', () => {
    const trialEndsAt = new Date('2026-09-22T17:00:00.000Z');
    // dueAt = 2026-09-22T13:00:00.000Z (10:00 BRT); +24h = 2026-09-23T13:00:00.000Z
    const onTime = new Date('2026-09-22T20:00:00.000Z');
    const staleAt = new Date('2026-09-23T13:00:00.000Z');

    expect(
      resolveEmailFunnelStepDueStatus({
        now: onTime,
        signupAt: new Date('2026-09-08T17:00:00.000Z'),
        trialEndsAt,
        triggerType: 'days_before_trial_end',
        triggerOffset: 0,
        sendHour: 10,
        windowStartHour: null,
        windowEndHour: null,
        timeZone,
      }),
    ).toBe('due');

    expect(
      resolveEmailFunnelStepDueStatus({
        now: staleAt,
        signupAt: new Date('2026-09-08T17:00:00.000Z'),
        trialEndsAt,
        triggerType: 'days_before_trial_end',
        triggerOffset: 0,
        sendHour: 10,
        windowStartHour: null,
        windowEndHour: null,
        timeZone,
      }),
    ).toBe('stale');
  });

  it('marks trial_ended_winback as stale after the 24h lateness window', () => {
    const trialEndsAt = new Date('2026-09-22T17:00:00.000Z');
    // days_after_trial_end offset 3 → dueAt 2026-09-25T13:00:00.000Z
    const onTime = new Date('2026-09-25T18:00:00.000Z');
    const staleAt = new Date('2026-09-26T13:00:00.000Z');

    expect(
      resolveEmailFunnelStepDueStatus({
        now: onTime,
        signupAt: new Date('2026-09-08T17:00:00.000Z'),
        trialEndsAt,
        triggerType: 'days_after_trial_end',
        triggerOffset: 3,
        sendHour: 10,
        windowStartHour: null,
        windowEndHour: null,
        timeZone,
      }),
    ).toBe('due');

    expect(
      resolveEmailFunnelStepDueStatus({
        now: staleAt,
        signupAt: new Date('2026-09-08T17:00:00.000Z'),
        trialEndsAt,
        triggerType: 'days_after_trial_end',
        triggerOffset: 3,
        sendHour: 10,
        windowStartHour: null,
        windowEndHour: null,
        timeZone,
      }),
    ).toBe('stale');
  });
});
