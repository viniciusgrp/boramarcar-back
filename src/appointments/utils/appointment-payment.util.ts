import type { PaymentStatus } from '../entities/payment-status.type';

export type AppointmentPaymentBadge = 'NONE' | 'DEPOSIT_PAID' | 'PAID';

export interface AppointmentPaymentView {
  totalPrice: number;
  depositAmount: number | null;
  depositPaid: boolean;
  depositPaidAmount: number;
  balanceDue: number;
  paymentStatus: PaymentStatus;
  paymentBadge: AppointmentPaymentBadge;
}

const PAYMENT_STATUS_SET = new Set<PaymentStatus>([
  'PENDING',
  'PAID',
  'REFUNDED',
  'EXPIRED',
  'NOT_REQUIRED',
]);

export function roundAppointmentCurrency(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 100) / 100;
}

export function resolveInitialPaymentStatus(
  requiresDepositPayment: boolean,
): PaymentStatus {
  return requiresDepositPayment ? 'PENDING' : 'NOT_REQUIRED';
}

export function normalizePaymentStatus(
  value: string | null | undefined,
): PaymentStatus {
  if (value && PAYMENT_STATUS_SET.has(value as PaymentStatus)) {
    return value as PaymentStatus;
  }

  return 'PENDING';
}

export function resolveAppointmentPaymentView(input: {
  status: string;
  totalPrice: number;
  depositAmount?: number | null;
  depositPaid?: boolean | null;
  paymentStatus?: string | null;
}): AppointmentPaymentView {
  const totalPrice = roundAppointmentCurrency(Math.max(0, input.totalPrice));
  const paymentStatus = normalizePaymentStatus(input.paymentStatus);
  const depositPaid = Boolean(input.depositPaid);
  const depositAmount =
    input.depositAmount === null || input.depositAmount === undefined
      ? null
      : roundAppointmentCurrency(Math.max(0, Number(input.depositAmount)));
  const depositSettled =
    depositPaid && paymentStatus === 'PAID' && (depositAmount ?? 0) > 0;
  const depositPaidAmount = depositSettled ? (depositAmount ?? 0) : 0;
  const openBalance = roundAppointmentCurrency(
    Math.max(0, totalPrice - depositPaidAmount),
  );
  const balanceDue =
    input.status === 'COMPLETED' ||
    input.status === 'CANCELLED' ||
    input.status === 'NO_SHOW'
      ? 0
      : openBalance;

  let paymentBadge: AppointmentPaymentBadge = 'NONE';

  if (
    input.status === 'COMPLETED' &&
    (totalPrice > 0 || depositPaidAmount > 0)
  ) {
    paymentBadge = 'PAID';
  } else if (depositPaidAmount > 0 && openBalance <= 0) {
    paymentBadge = 'PAID';
  } else if (depositPaidAmount > 0) {
    paymentBadge = 'DEPOSIT_PAID';
  }

  return {
    totalPrice,
    depositAmount,
    depositPaid,
    depositPaidAmount,
    balanceDue,
    paymentStatus,
    paymentBadge,
  };
}
