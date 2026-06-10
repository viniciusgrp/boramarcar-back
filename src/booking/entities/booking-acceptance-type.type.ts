export type TenantBookingAcceptanceType = 'AUTOMATIC' | 'MANUAL';

export type ProfessionalBookingAcceptanceType =
  | 'DEFAULT'
  | 'AUTOMATIC'
  | 'MANUAL';

export const TENANT_BOOKING_ACCEPTANCE_TYPES: TenantBookingAcceptanceType[] = [
  'AUTOMATIC',
  'MANUAL',
];

export const PROFESSIONAL_BOOKING_ACCEPTANCE_TYPES: ProfessionalBookingAcceptanceType[] =
  ['DEFAULT', 'AUTOMATIC', 'MANUAL'];
