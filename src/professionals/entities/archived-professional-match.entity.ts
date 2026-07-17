export const ARCHIVED_PROFESSIONAL_MATCH_CODE = 'ARCHIVED_PROFESSIONAL_MATCH';

export interface ArchivedProfessionalMatchResponse {
  code: typeof ARCHIVED_PROFESSIONAL_MATCH_CODE;
  message: string;
  professionalId: string;
  name: string;
  contactPhone: string | null;
}
