import { isAfter } from 'date-fns';
import type { AppointmentStatus } from '../entities/appointment.entity';
import type { CustomerAppointmentScope } from '../entities/customer-appointment.entity';
import { parseWallClockDateTime } from '../../schedule/utils/wall-clock-datetime.util';

export const CUSTOMER_CANCELLABLE_STATUSES: AppointmentStatus[] = [
  'PENDING',
  'PENDING_PAYMENT',
  'PENDING_APPROVAL',
  'CONFIRMED',
];

export function isUpcomingCustomerAppointment(
  row: { start_time: string; status: string },
  now: Date,
): boolean {
  if (!CUSTOMER_CANCELLABLE_STATUSES.includes(row.status as AppointmentStatus)) {
    return false;
  }

  return !isAfter(now, parseWallClockDateTime(row.start_time));
}

export function matchesCustomerAppointmentScope(
  row: { start_time: string; status: string },
  scope: CustomerAppointmentScope,
  now: Date,
): boolean {
  const isUpcoming = isUpcomingCustomerAppointment(row, now);
  return scope === 'upcoming' ? isUpcoming : !isUpcoming;
}
