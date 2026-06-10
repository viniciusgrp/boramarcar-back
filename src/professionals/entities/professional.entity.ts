import type { ProfessionalBookingAcceptanceType } from '../../booking/entities/booking-acceptance-type.type';

export interface ProfessionalServiceLink {
  service_id: string;
}

export interface Professional {
  id: string;
  tenant_id: string;
  name: string;
  contact_phone: string | null;
  avatar_url: string | null;
  commission_percent: number;
  booking_acceptance_type: ProfessionalBookingAcceptanceType;
  is_active: boolean;
  professional_services?: ProfessionalServiceLink[];
}
