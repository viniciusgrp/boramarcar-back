export type PaymentStatus =
  | 'PENDING'
  | 'PAID'
  | 'REFUNDED'
  | 'EXPIRED'
  | 'NOT_REQUIRED';

export const PAYMENT_STATUSES: PaymentStatus[] = [
  'PENDING',
  'PAID',
  'REFUNDED',
  'EXPIRED',
  'NOT_REQUIRED',
];

export const APPOINTMENT_PAYMENT_METHODS = [
  'CASH',
  'CARD',
  'PIX',
  'OTHER',
] as const;

export type AppointmentPaymentMethod =
  (typeof APPOINTMENT_PAYMENT_METHODS)[number];
