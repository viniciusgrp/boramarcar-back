import type { AppointmentStatus } from './appointment.entity';
import type { CustomerReviewStatus } from '../../reviews/entities/customer-review.entity';

export type CustomerAppointmentScope = 'upcoming' | 'past';

export interface CustomerAppointment {
  id: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  professionalId: string;
  professionalName: string;
  serviceIds: string[];
  serviceName: string;
  durationMinutes: number;
  cancellationRequestedAt: string | null;
  canRequestCancellation: boolean;
  allowsAutomaticCancellation: boolean;
  canReschedule: boolean;
  allowsCustomerReschedule: boolean;
  canLeaveReview: boolean;
  reviewStatus: CustomerReviewStatus | null;
  tenantId: string;
  tenantSlug: string;
  customerName?: string;
  customerPhone?: string;
}
