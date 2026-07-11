import type { BookingLoyaltyFeedback } from '../../loyalty/entities/booking-loyalty-feedback.entity';
import type { AssignedBookingProfessional } from './assigned-booking-professional.entity';
import type { Appointment } from './appointment.entity';

export interface CreateAppointmentResponse {
  appointment: Appointment;
  assignedProfessional: AssignedBookingProfessional;
  checkoutUrl?: string;
  loyaltyFeedback?: BookingLoyaltyFeedback;
  customerReferralCode?: string | null;
  /** Present for guest bookings (no auth). Store with appointment id in localStorage. */
  guestAccessToken?: string;
}
