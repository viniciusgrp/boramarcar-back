export interface ProfessionalAbsence {
  id: string;
  tenantId: string;
  professionalId: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  createdAt: string;
}
