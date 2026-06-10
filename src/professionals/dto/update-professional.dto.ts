import type { ProfessionalBookingAcceptanceType } from '../../booking/entities/booking-acceptance-type.type';

export class UpdateProfessionalDto {
  name?: string;
  contactPhone?: string | null;
  avatarUrl?: string | null;
  commissionPercent?: number;
  isActive?: boolean;
  serviceIds?: string[];
  bookingAcceptanceType?: ProfessionalBookingAcceptanceType;
}
