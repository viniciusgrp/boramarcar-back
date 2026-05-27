export type AppointmentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'NO_SHOW';

export const APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'PENDING',
  'CONFIRMED',
  'CANCELLED',
  'COMPLETED',
  'NO_SHOW',
];

import type { BookingSource } from './booking-source.type';

export interface Appointment {
  id: string;
  tenant_id: string;
  professional_id: string;
  service_id: string;
  customer_name: string;
  customer_phone: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  deposit_paid: boolean;
  booking_source: BookingSource;
}
