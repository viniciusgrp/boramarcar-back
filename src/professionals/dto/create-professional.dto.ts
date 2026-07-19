import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  IsUUID,
} from 'class-validator';
import type { ProfessionalBookingAcceptanceType } from '../../booking/entities/booking-acceptance-type.type';

export class CreateProfessionalDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  contactPhone?: string | null;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercent?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  serviceIds?: string[];

  @IsOptional()
  @IsEnum(['DEFAULT', 'AUTOMATIC', 'MANUAL'] as const)
  bookingAcceptanceType?: ProfessionalBookingAcceptanceType;

  /** Optional invite email used only to match an archived professional. */
  @IsOptional()
  @IsEmail()
  inviteEmail?: string;
}
