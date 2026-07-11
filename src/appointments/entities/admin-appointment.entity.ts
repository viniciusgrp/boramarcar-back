import type { AppointmentStatus } from './appointment.entity';
import type { BookingSource } from './booking-source.type';

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
  serviceName: string;
  durationMinutes: number;
  servicePrice: number;
  bookingSource: BookingSource;
  paidWithPoints: boolean;
}
