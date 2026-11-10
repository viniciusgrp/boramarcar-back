import { resolveEmailFunnelEligibility } from './email-funnel-eligibility.util';

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
});
