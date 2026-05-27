import { Appointment } from '../../appointments/entities/appointment.entity';

/** Appointment row enriched with the service display name for WhatsApp copy. */
export type WhatsAppAppointment = Appointment & {
  service_name: string;
};
