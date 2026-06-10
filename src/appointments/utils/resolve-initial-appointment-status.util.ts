import type { TenantBookingAcceptanceType } from '../../booking/entities/booking-acceptance-type.type';
import type { AppointmentStatus } from '../entities/appointment.entity';

export function resolveInitialAppointmentStatus(params: {
  requiresDepositPayment: boolean;
  isPaidWithPoints: boolean;
  bookingAcceptanceType: TenantBookingAcceptanceType;
}): AppointmentStatus {
  if (params.requiresDepositPayment) {
    return 'PENDING_PAYMENT';
  }

  if (
    params.bookingAcceptanceType === 'MANUAL' &&
    !params.isPaidWithPoints
  ) {
    return 'PENDING_APPROVAL';
  }

  return 'CONFIRMED';
}
