export type ProfessionalWorkStatus = 'working' | 'off';

export class ProfessionalDayStatusDto {
  professionalId!: string;
  status!: ProfessionalWorkStatus;
  openTime!: string | null;
  closeTime!: string | null;
}
