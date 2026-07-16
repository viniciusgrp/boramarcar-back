/**
 * Política explícita de sinal (depósito) no BoraMarcar.
 *
 * 1. Hold: ao criar agendamento com sinal, o status fica PENDING_PAYMENT e o slot
 *    fica reservado até hold_expires_at (alinhado à expiração do Checkout Stripe, 30 min)
 *    ou até o cliente concluir / abandonar o pagamento.
 * 2. Confirmação: o webhook só confirma (CONFIRMED + PAID) se o status ainda for
 *    PENDING_PAYMENT. Pagamento tardio após CANCELLED não reativa o horário.
 * 3. Pagamento tardio (hold expirado / abandonado / cancelado): o valor capturado
 *    deve ser estornado automaticamente no Stripe e payment_status vira REFUNDED.
 * 4. Cancelamento de agendamento já PAID (cliente ou estabelecimento): o sinal
 *    NÃO é reembolsado automaticamente (proteção contra no-show). Estorno manual
 *    fica a critério do estabelecimento no Dashboard Stripe / suporte.
 * 5. Falha ao criar a sessão de Checkout: o hold PENDING_PAYMENT é cancelado na hora
 *    para não bloquear o slot até o cron.
 * 6. checkout.session.expired / página de cancelamento: liberam o hold PENDING_PAYMENT
 *    imediatamente (status CANCELLED).
 */

export const DEPOSIT_HOLD_MINUTES = 30;

export const DEPOSIT_CONFIRMABLE_STATUS = 'PENDING_PAYMENT' as const;

export const DEPOSIT_BLOCKING_STATUSES = [
  'PENDING',
  'PENDING_PAYMENT',
  'PENDING_APPROVAL',
  'CONFIRMED',
] as const;

export type DepositConfirmOutcome =
  | 'confirmed'
  | 'already_confirmed'
  | 'late_payment_needs_refund'
  | 'ignored'
  | 'not_found';

export function resolveDepositConfirmOutcome(
  status: string | null | undefined,
  paymentStatus: string | null | undefined,
  depositPaid: boolean | null | undefined,
): DepositConfirmOutcome {
  if (!status) {
    return 'not_found';
  }

  if (status === DEPOSIT_CONFIRMABLE_STATUS) {
    return 'confirmed';
  }

  if (
    status === 'CONFIRMED' &&
    (paymentStatus === 'PAID' || depositPaid === true)
  ) {
    return 'already_confirmed';
  }

  if (status === 'CANCELLED') {
    return 'late_payment_needs_refund';
  }

  return 'ignored';
}

export function shouldAutoRefundDeposit(outcome: DepositConfirmOutcome): boolean {
  return outcome === 'late_payment_needs_refund';
}

export function isCustomerPaidDepositRefundableAutomatically(): boolean {
  return false;
}
