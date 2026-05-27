export interface ProfessionalHourRow {
  id: string;
  professional_id: string;
  tenant_id: string;
  day_of_week: number;
  opening_time: string;
  closing_time: string;
  is_closed: boolean;
}

export interface ProfessionalHour {
  id: string;
  professionalId: string;
  tenantId: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}
