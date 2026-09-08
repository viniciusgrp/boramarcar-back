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
});
