import type { AppointmentStatus } from './appointment.entity';
import type { BookingSource } from './booking-source.type';
import type { PaymentStatus } from './payment-status.type';
import type { AppointmentPaymentBadge } from '../utils/appointment-payment.util';

export interface AdminAppointment {
  id: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  professionalId: string;
  professionalName: string;
  serviceIds: string[];
  serviceName: string;
  durationMinutes: number;
  servicePrice: number;
  totalPrice: number;
  depositAmount: number | null;
  depositPaid: boolean;
  depositPaidAmount: number;
  balanceDue: number;
  paymentStatus: PaymentStatus;
  paymentBadge: AppointmentPaymentBadge;
  bookingSource: BookingSource;
  paidWithPoints: boolean;
  /** Estimated points earned on completion (0 when loyalty is off or paid with points). */
  estimatedLoyaltyPoints: number;
  couponCode: string | null;
  couponDiscountAmount: number | null;
}
