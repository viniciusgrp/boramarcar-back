import type { AppointmentStatus } from './appointment.entity';

export interface AdminAppointment {
  id: string;
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
}
