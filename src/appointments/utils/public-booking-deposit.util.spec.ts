import { resolvePublicBookingDeposit } from './public-booking-deposit.util';

describe('resolvePublicBookingDeposit', () => {
  const requested = {
    isPaidWithPoints: false,
    planAllowsDeposit: true,
    bookingRequiresDeposit: true,
    totalDepositAmount: 20,
    canChargeDeposits: true,
  };

  it('charges a deposit when the subaccount can receive it', () => {
    expect(resolvePublicBookingDeposit(requested)).toEqual({
      requiresDepositPayment: true,
      skippedUnapprovedSubaccount: false,
    });
  });

  it('books without a deposit when the subaccount cannot charge', () => {
    expect(
      resolvePublicBookingDeposit({ ...requested, canChargeDeposits: false }),
    ).toEqual({
      requiresDepositPayment: false,
      skippedUnapprovedSubaccount: true,
    });
  });

  it('does not charge when the booking does not require a deposit', () => {
    expect(
      resolvePublicBookingDeposit({
        ...requested,
        bookingRequiresDeposit: false,
        canChargeDeposits: false,
      }),
    ).toEqual({
      requiresDepositPayment: false,
      skippedUnapprovedSubaccount: false,
    });
  });
});
