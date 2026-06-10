import type {
  ProfessionalBookingAcceptanceType,
  TenantBookingAcceptanceType,
} from '../entities/booking-acceptance-type.type';

export function resolveEffectiveBookingAcceptance(
  tenantType: TenantBookingAcceptanceType,
  professionalType: ProfessionalBookingAcceptanceType,
): TenantBookingAcceptanceType {
  if (professionalType === 'DEFAULT') {
    return tenantType;
  }

  return professionalType;
}
