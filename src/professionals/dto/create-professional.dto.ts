import type { ProfessionalBookingAcceptanceType } from '../../booking/entities/booking-acceptance-type.type';

export class CreateProfessionalDto {
  name!: string;
  contactPhone?: string | null;
  avatarUrl?: string;
  commissionPercent?: number;
  isActive?: boolean;
  serviceIds?: string[];
  bookingAcceptanceType?: ProfessionalBookingAcceptanceType;
}
