export function roundCommissionCents(
  grossAmountCents: number,
  commissionPercent: number,
): number {
  if (grossAmountCents <= 0 || commissionPercent <= 0) {
    return 0;
  }

  return Math.round((grossAmountCents * commissionPercent) / 100);
}

export function shouldSkipUnpaidOrTrialInvoice(params: {
  amountPaid: number;
  planGrossCents: number;
}): boolean {
  return params.amountPaid <= 0 || params.planGrossCents <= 0;
}

export function canIncludeInPayout(availableCents: number, minimumCents: number): boolean {
  return availableCents >= minimumCents;
}

export function buildReversalInvoiceId(stripeInvoiceId: string): string {
  return `${stripeInvoiceId}:rev`;
}
