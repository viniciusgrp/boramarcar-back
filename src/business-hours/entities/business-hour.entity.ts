export interface BusinessHour {
  id: string;
  tenantId: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

export interface BusinessHourRow {
  id: string;
  tenant_id: string;
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}
