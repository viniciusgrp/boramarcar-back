import type { Appointment } from './appointment.entity';

export interface CreateAppointmentResponse {
  appointment: Appointment;
  checkoutUrl?: string;
}
