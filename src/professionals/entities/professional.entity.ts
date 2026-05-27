export interface ProfessionalServiceLink {
  service_id: string;
}

export interface Professional {
  id: string;
  tenant_id: string;
  name: string;
  avatar_url: string | null;
  is_active: boolean;
  professional_services?: ProfessionalServiceLink[];
}
