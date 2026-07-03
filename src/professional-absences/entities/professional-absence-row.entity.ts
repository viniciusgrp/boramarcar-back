export interface ProfessionalAbsenceRow {
  id: string;
  tenant_id: string;
  professional_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  created_at: string;
}
