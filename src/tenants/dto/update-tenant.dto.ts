import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsBrazilianPhone } from '../../common/validators/is-brazilian-phone.validator';
import type { TenantBookingAcceptanceType } from '../../booking/entities/booking-acceptance-type.type';
import type { CalendarCardPreferences } from '../entities/calendar-card-preferences.type';
import type { PayoutFrequency } from '../entities/payout-frequency.type';

export class UpdateTenantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string | null;

  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  primaryColor!: string;

  @IsOptional()
  @IsString()
  @IsBrazilianPhone()
  contactPhone?: string | null;

  @IsOptional()
  @IsString()
  logoUrl?: string | null;

  @IsOptional()
  @IsString()
  bannerUrl?: string | null;

  @IsOptional()
  @IsString()
  bannerOverlayColor?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  bannerOverlayOpacity?: number;

  @IsOptional()
  @IsString()
  addressCep?: string | null;

  @IsOptional()
  @IsString()
  addressStreet?: string | null;

  @IsOptional()
  @IsString()
  addressNumber?: string | null;

  @IsOptional()
  @IsString()
  addressComplement?: string | null;

  @IsOptional()
  @IsString()
  addressNeighborhood?: string | null;

  @IsOptional()
  @IsString()
  addressCity?: string | null;

  @IsOptional()
  @IsString()
  addressState?: string | null;

  @IsOptional()
  @IsBoolean()
  requireCustomerEmailConfirmation?: boolean;

  @IsOptional()
  @IsBoolean()
  requireCustomerAccount?: boolean;

  @IsOptional()
  @IsBoolean()
  allowCustomerSelfCancellation?: boolean;

  @IsEnum(['AUTOMATIC', 'MANUAL'] as const)
  bookingAcceptanceType!: TenantBookingAcceptanceType;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(120)
  bookingSlotIntervalMinutes?: number;

  @IsOptional()
  @IsObject()
  calendarCardPreferences?: CalendarCardPreferences;

  @IsOptional()
  @IsBoolean()
  enablePayoutControl?: boolean;

  @IsOptional()
  @IsEnum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'] as const)
  payoutFrequency?: PayoutFrequency;

  @IsOptional()
  @IsBoolean()
  enableReferralProgram?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  referrerPointsBonus?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  refereePointsBonus?: number;
}
