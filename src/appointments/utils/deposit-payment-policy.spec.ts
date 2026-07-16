import {
  DEPOSIT_HOLD_MINUTES,
  isCustomerPaidDepositRefundableAutomatically,
  resolveDepositConfirmOutcome,
  shouldAutoRefundDeposit,
} from './deposit-payment-policy';

describe('deposit-payment-policy', () => {
  it('uses a 30-minute hold window', () => {
    expect(DEPOSIT_HOLD_MINUTES).toBe(30);
  });

  it('confirms only PENDING_PAYMENT holds', () => {
    expect(
      resolveDepositConfirmOutcome('PENDING_PAYMENT', 'PENDING', false),
    ).toBe('confirmed');
  });

  it('treats already paid confirmed appointments as idempotent', () => {
    expect(resolveDepositConfirmOutcome('CONFIRMED', 'PAID', true)).toBe(
      'already_confirmed',
    );
  });

  it('flags cancelled holds as late payment needing refund', () => {
    expect(resolveDepositConfirmOutcome('CANCELLED', 'PENDING', false)).toBe(
      'late_payment_needs_refund',
    );
    expect(shouldAutoRefundDeposit('late_payment_needs_refund')).toBe(true);
  });

  it('ignores other statuses', () => {
    expect(resolveDepositConfirmOutcome('COMPLETED', 'PAID', true)).toBe(
      'ignored',
    );
    expect(resolveDepositConfirmOutcome(null, null, null)).toBe('not_found');
  });

  it('documents that customer-paid deposits are not auto-refunded on cancel', () => {
    expect(isCustomerPaidDepositRefundableAutomatically()).toBe(false);
  });
});
