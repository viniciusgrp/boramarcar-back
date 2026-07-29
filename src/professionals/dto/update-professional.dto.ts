import {
  IsArray,
  IsBoolean,
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

export class UpdateProfessionalDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string | null;

  @IsOptional()
  @IsString()
  avatarUrl?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  productCommissionPercent?: number;

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
}
