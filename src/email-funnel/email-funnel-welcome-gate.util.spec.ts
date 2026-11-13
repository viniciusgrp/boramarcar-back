import { shouldDeferWelcomeUntilOwnerEmailConfirmed } from './email-funnel-welcome-gate.util';

describe('shouldDeferWelcomeUntilOwnerEmailConfirmed', () => {
  it('holds welcome while the owner email is still unconfirmed', () => {
    expect(
      shouldDeferWelcomeUntilOwnerEmailConfirmed({
        stepKey: 'welcome',
        ownerEmailConfirmed: false,
      }),
    ).toBe(true);
  });

  it('sends welcome once the owner email is confirmed', () => {
    expect(
      shouldDeferWelcomeUntilOwnerEmailConfirmed({
        stepKey: 'welcome',
        ownerEmailConfirmed: true,
      }),
    ).toBe(false);
  });

  it('does not hold later steps such as trial_mid', () => {
    expect(
      shouldDeferWelcomeUntilOwnerEmailConfirmed({
        stepKey: 'trial_mid',
        ownerEmailConfirmed: false,
      }),
    ).toBe(false);
  });
});
