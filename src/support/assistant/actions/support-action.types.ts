export const SUPPORT_ACTION_TYPES = [
  'create_absence',
  'cancel_appointment',
] as const;

export type SupportActionType = (typeof SUPPORT_ACTION_TYPES)[number];

export interface SupportCreateAbsencePayload {
  date: string;
  allDay?: boolean;
  startTime?: string;
  endTime?: string;
  reason?: string;
  professionalId?: string;
}

export interface SupportCancelAppointmentPayload {
  appointmentId?: string;
  date?: string;
  time?: string;
  customerNameHint?: string;
}

export type SupportActionPayload =
  | SupportCreateAbsencePayload
  | SupportCancelAppointmentPayload;

export interface SupportParsedActionPropose {
  type: SupportActionType;
  payload: SupportActionPayload;
}

export interface SupportProposedActionCard {
  id: string;
  type: SupportActionType;
  summary: string;
  details: Record<string, string | number | boolean>;
  warnings?: string[];
  requiresCancelConflicting?: boolean;
  conflictCount?: number;
}

export interface SupportActionExecuteResult {
  success: true;
  message: string;
  gotoPath?: string;
}
