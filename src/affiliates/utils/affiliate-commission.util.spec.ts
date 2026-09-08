import {
  canIncludeInPayout,
  roundCommissionCents,
  shouldSkipUnpaidOrTrialInvoice,
} from './affiliate-commission.util';

describe('affiliate-commission.util', () => {
  it('rounds commission cents from the paid amount', () => {
    expect(roundCommissionCents(10000, 20)).toBe(2000);
    expect(roundCommissionCents(0, 20)).toBe(0);
  });

  it('skips unpaid or trial invoices', () => {
    expect(shouldSkipUnpaidOrTrialInvoice({ amountPaid: 0, planGrossCents: 1000 })).toBe(
      true,
    );
    expect(shouldSkipUnpaidOrTrialInvoice({ amountPaid: 1000, planGrossCents: 1000 })).toBe(
      false,
    );
  });

  it('gates payouts by the minimum threshold', () => {
    expect(canIncludeInPayout(4999, 5000)).toBe(false);
    expect(canIncludeInPayout(5000, 5000)).toBe(true);
  });
});
