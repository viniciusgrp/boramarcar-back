import type { Professional } from './professional.entity';

/** Public booking catalog: no commission or soft-delete internals. */
export interface PublicProfessional {
  id: string;
  tenant_id: string;
  name: string;
  contact_phone: string | null;
  avatar_url: string | null;
  booking_acceptance_type: Professional['booking_acceptance_type'];
  is_active: boolean;
  professional_services?: Professional['professional_services'];
}

export function toPublicProfessional(professional: Professional): PublicProfessional {
  return {
    id: professional.id,
    tenant_id: professional.tenant_id,
    name: professional.name,
    contact_phone: professional.contact_phone,
    avatar_url: professional.avatar_url,
    booking_acceptance_type: professional.booking_acceptance_type,
    is_active: professional.is_active,
    professional_services: professional.professional_services,
  };
}
