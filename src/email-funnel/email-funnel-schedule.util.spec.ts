import { isEmailFunnelStepDue } from './email-funnel-schedule.util';

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
});
