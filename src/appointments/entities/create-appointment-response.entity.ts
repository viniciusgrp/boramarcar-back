import type { BookingLoyaltyFeedback } from '../../loyalty/entities/booking-loyalty-feedback.entity';
import type { Appointment } from './appointment.entity';

export interface CreateAppointmentResponse {
  appointment: Appointment;
  checkoutUrl?: string;
  loyaltyFeedback?: BookingLoyaltyFeedback;
  customerReferralCode?: string | null;
}
