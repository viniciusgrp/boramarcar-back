export function resolvePublicBookingDeposit(params: {
  isPaidWithPoints: boolean;
  planAllowsDeposit: boolean;
  bookingRequiresDeposit: boolean;
  totalDepositAmount: number;
  canChargeDeposits: boolean;
}): { requiresDepositPayment: boolean; skippedUnapprovedSubaccount: boolean } {
  const requested =
    !params.isPaidWithPoints &&
    params.planAllowsDeposit &&
    params.bookingRequiresDeposit &&
    params.totalDepositAmount > 0;

  if (requested && !params.canChargeDeposits) {
    return {
      requiresDepositPayment: false,
      skippedUnapprovedSubaccount: true,
    };
  }

  return {
    requiresDepositPayment: requested,
    skippedUnapprovedSubaccount: false,
  };
}
