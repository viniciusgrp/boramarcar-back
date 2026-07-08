import type { BookingLoyaltyFeedback } from '../../loyalty/entities/booking-loyalty-feedback.entity';
import type { AssignedBookingProfessional } from './assigned-booking-professional.entity';
import type { Appointment } from './appointment.entity';

export interface CreateAppointmentResponse {
  appointment: Appointment;
  assignedProfessional: AssignedBookingProfessional;
  checkoutUrl?: string;
  loyaltyFeedback?: BookingLoyaltyFeedback;
  customerReferralCode?: string | null;
}
