import type { TenantBookingAcceptanceType } from '../../booking/entities/booking-acceptance-type.type';
import type { CalendarCardPreferences } from '../entities/calendar-card-preferences.type';
import type { PayoutFrequency } from '../entities/payout-frequency.type';

export class UpdateTenantDto {
  name!: string;
  slug!: string;
  primaryColor!: string;
  contactPhone?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  addressCep?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  addressNeighborhood?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  requireDeposit!: boolean;
  requireCustomerEmailConfirmation?: boolean;
  allowCustomerSelfCancellation?: boolean;
  bookingAcceptanceType!: TenantBookingAcceptanceType;
  calendarCardPreferences?: CalendarCardPreferences;
  enablePayoutControl?: boolean;
  payoutFrequency?: PayoutFrequency;
  enableReferralProgram?: boolean;
  referrerPointsBonus?: number;
  refereePointsBonus?: number;
}
