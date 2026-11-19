import {
  resolveEmailFunnelEligibility,
  shouldRecordSkip,
} from './email-funnel-eligibility.util';

describe('resolveEmailFunnelEligibility', () => {
  const base = {
    isActive: true,
    optedOut: false,
    subscriptionStatus: 'INACTIVE',
    trialEnded: false,
    skipIfSetupComplete: true,
    hasService: false,
    hasBusinessHours: false,
    alreadyProcessed: false,
    isDue: true,
    hasRecipientEmail: true,
    sendOnlyIf: null,
    hasBookingLinkShared: false,
    hasPublicBooking: false,
    isPostTrialStep: false,
    isLastDayOfTrialStep: false,
  };

  it('sends when the tenant did nothing and the step is due', () => {
    expect(resolveEmailFunnelEligibility(base)).toBe('send');
  });

  it('stops remaining funnel mail after a paid subscription', () => {
    expect(
      resolveEmailFunnelEligibility({
        ...base,
        subscriptionStatus: 'ACTIVE',
      }),
    ).toBe('paid');
  });

  it('skips setup emails when services and hours exist', () => {
    expect(
      resolveEmailFunnelEligibility({
        ...base,
        hasService: true,
        hasBusinessHours: true,
      }),
    ).toBe('setup_complete');
  });

  it('still sends non-setup emails when agenda is already configured', () => {
    expect(
      resolveEmailFunnelEligibility({
        ...base,
        skipIfSetupComplete: false,
        hasService: true,
        hasBusinessHours: true,
      }),
    ).toBe('send');
  });

  it('does not send after opt-out', () => {
    expect(
      resolveEmailFunnelEligibility({
        ...base,
        optedOut: true,
      }),
    ).toBe('opted_out');
  });

  it('waits when the schedule is not due yet', () => {
    expect(
      resolveEmailFunnelEligibility({
        ...base,
        isDue: false,
      }),
    ).toBe('not_due');
  });

  it('returns not_due before failing condition when the step is not due yet', () => {
    expect(
      resolveEmailFunnelEligibility({
        ...base,
        isDue: false,
        skipIfSetupComplete: false,
        sendOnlyIf: 'setup_complete_and_not_shared',
        hasService: false,
        hasBusinessHours: false,
      }),
    ).toBe('not_due');
  });

  it('returns not_due before setup_complete when the step is not due yet', () => {
    expect(
      resolveEmailFunnelEligibility({
        ...base,
        isDue: false,
        hasService: true,
        hasBusinessHours: true,
      }),
    ).toBe('not_due');
  });

  it('skips with condition_not_met only when the step is due', () => {
    expect(
      resolveEmailFunnelEligibility({
        ...base,
        isDue: true,
        skipIfSetupComplete: false,
        sendOnlyIf: 'no_public_booking',
        hasService: false,
        hasBusinessHours: true,
        hasPublicBooking: false,
      }),
    ).toBe('condition_not_met');
  });

  it('skips with setup_complete only when the step is due', () => {
    expect(
      resolveEmailFunnelEligibility({
        ...base,
        isDue: true,
        hasService: true,
        hasBusinessHours: true,
      }),
    ).toBe('setup_complete');
  });

  it('pauses non-welcome steps while owner email is unconfirmed without recording skip', () => {
    expect(
      resolveEmailFunnelEligibility({
        ...base,
        stepKey: 'nudge_agenda',
        ownerEmailConfirmed: false,
      }),
    ).toBe('email_unconfirmed');
    expect(shouldRecordSkip('email_unconfirmed')).toBe(false);
  });

  it('does not pause welcome via email_unconfirmed (welcome uses its own gate)', () => {
    expect(
      resolveEmailFunnelEligibility({
        ...base,
        skipIfSetupComplete: false,
        stepKey: 'welcome',
        ownerEmailConfirmed: false,
      }),
    ).toBe('send');
  });

  it('resumes non-welcome steps once owner email is confirmed', () => {
    expect(
      resolveEmailFunnelEligibility({
        ...base,
        skipIfSetupComplete: false,
        stepKey: 'tutorial',
        ownerEmailConfirmed: true,
      }),
    ).toBe('send');
  });

  it('prefers stale over email_unconfirmed when the due window already expired', () => {
    expect(
      resolveEmailFunnelEligibility({
        ...base,
        skipIfSetupComplete: false,
        stepKey: 'nudge_agenda',
        ownerEmailConfirmed: false,
        dueStatus: 'stale',
      }),
    ).toBe('stale');
  });

  it('blocks during trial steps after trial ends', () => {
    expect(
      resolveEmailFunnelEligibility({
        ...base,
        trialEnded: true,
        isPostTrialStep: false,
      }),
    ).toBe('trial_ended');
  });

  it('allows post-trial steps after trial ends', () => {
    expect(
      resolveEmailFunnelEligibility({
        ...base,
        skipIfSetupComplete: false,
        trialEnded: true,
        isPostTrialStep: true,
      }),
    ).toBe('send');
  });

  it('allows last-day-of-trial step even when trial has technically ended', () => {
    // This handles the case where trial_ends_at is 08:00 but send_hour is 10:00
    // At 10:00, trialEnded is true, but we still want to send the last-day email
    expect(
      resolveEmailFunnelEligibility({
        ...base,
        skipIfSetupComplete: false,
        trialEnded: true,
        isPostTrialStep: false,
        isLastDayOfTrialStep: true,
      }),
    ).toBe('send');
  });

  it('skips when setup_complete_and_not_shared condition is not met (no setup)', () => {
    expect(
      resolveEmailFunnelEligibility({
        ...base,
        skipIfSetupComplete: false,
        sendOnlyIf: 'setup_complete_and_not_shared',
        hasService: false,
        hasBusinessHours: false,
        hasBookingLinkShared: false,
      }),
    ).toBe('condition_not_met');
  });

  it('skips when setup_complete_and_not_shared condition is not met (already shared)', () => {
    expect(
      resolveEmailFunnelEligibility({
        ...base,
        skipIfSetupComplete: false,
        sendOnlyIf: 'setup_complete_and_not_shared',
        hasService: true,
        hasBusinessHours: true,
        hasBookingLinkShared: true,
      }),
    ).toBe('condition_not_met');
  });

  it('sends when setup_complete_and_not_shared condition is met', () => {
    expect(
      resolveEmailFunnelEligibility({
        ...base,
        skipIfSetupComplete: false,
        sendOnlyIf: 'setup_complete_and_not_shared',
        hasService: true,
        hasBusinessHours: true,
        hasBookingLinkShared: false,
      }),
    ).toBe('send');
  });

  it('skips when no_public_booking condition is not met (no setup)', () => {
    expect(
      resolveEmailFunnelEligibility({
        ...base,
        skipIfSetupComplete: false,
        sendOnlyIf: 'no_public_booking',
        hasService: false,
        hasBusinessHours: false,
        hasPublicBooking: false,
      }),
    ).toBe('condition_not_met');
  });

  it('skips when no_public_booking condition is not met (already has public booking)', () => {
    expect(
      resolveEmailFunnelEligibility({
        ...base,
        skipIfSetupComplete: false,
        sendOnlyIf: 'no_public_booking',
        hasService: true,
        hasBusinessHours: true,
        hasPublicBooking: true,
      }),
    ).toBe('condition_not_met');
  });

  it('sends when no_public_booking condition is met', () => {
    expect(
      resolveEmailFunnelEligibility({
        ...base,
        skipIfSetupComplete: false,
        sendOnlyIf: 'no_public_booking',
        hasService: true,
        hasBusinessHours: true,
        hasPublicBooking: false,
      }),
    ).toBe('send');
  });

  it('returns stale when dueStatus is stale', () => {
    expect(
      resolveEmailFunnelEligibility({
        ...base,
        skipIfSetupComplete: false,
        dueStatus: 'stale',
      }),
    ).toBe('stale');
  });

  it('still allows last-day step when trial ended and dueStatus is due', () => {
    expect(
      resolveEmailFunnelEligibility({
        ...base,
        skipIfSetupComplete: false,
        trialEnded: true,
        isLastDayOfTrialStep: true,
        dueStatus: 'due',
      }),
    ).toBe('send');
  });

  it('records skip for stale but not for not_due or email_unconfirmed', () => {
    expect(shouldRecordSkip('stale')).toBe(true);
    expect(shouldRecordSkip('not_due')).toBe(false);
    expect(shouldRecordSkip('email_unconfirmed')).toBe(false);
  });
});
