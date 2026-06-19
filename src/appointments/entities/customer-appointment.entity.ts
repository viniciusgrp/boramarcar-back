import type { AppointmentStatus } from './appointment.entity';

export type CustomerAppointmentScope = 'upcoming' | 'past';

export interface CustomerAppointment {
  id: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  professionalName: string;
  serviceName: string;
  durationMinutes: number;
  cancellationRequestedAt: string | null;
  canRequestCancellation: boolean;
  tenantId: string;
  tenantSlug: string;
}
