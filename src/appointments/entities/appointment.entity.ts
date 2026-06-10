import type { BookingSource } from './booking-source.type';
import type { PaymentStatus } from './payment-status.type';

export type AppointmentStatus =
  | 'PENDING'
  | 'PENDING_PAYMENT'
  | 'PENDING_APPROVAL'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'NO_SHOW';

export const APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'PENDING',
  'PENDING_PAYMENT',
  'PENDING_APPROVAL',
  'CONFIRMED',
  'CANCELLED',
  'COMPLETED',
  'NO_SHOW',
];

export interface Appointment {
  id: string;
  tenant_id: string;
  professional_id: string;
  service_id: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  deposit_paid: boolean;
  payment_status: PaymentStatus;
  commission_amount: number;
  booking_source: BookingSource;
  loyalty_reward_id?: string | null;
}
