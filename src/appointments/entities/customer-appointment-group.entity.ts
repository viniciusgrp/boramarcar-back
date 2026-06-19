import type { CustomerAppointment } from './customer-appointment.entity';

export interface CustomerAppointmentGroup {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  appointments: CustomerAppointment[];
}
