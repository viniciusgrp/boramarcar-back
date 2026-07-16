import {
  IsArray,
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { IsBrazilianPhone } from '../../common/validators/is-brazilian-phone.validator';

export class CreateAppointmentDto {
  @IsUUID()
  tenantId!: string;

  @IsOptional()
  @IsUUID()
  professionalId?: string;

  /** @deprecated Use serviceIds. Kept for backward compatibility. */
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  serviceIds?: string[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  customerName?: string;

  @IsOptional()
  @IsString()
  @IsBrazilianPhone()
  customerPhone?: string;

  @IsISO8601()
  startTime!: string;

  @IsOptional()
  @IsUUID()
  loyaltyRewardId?: string;

  @IsOptional()
  @IsString()
  referralCode?: string;

  @IsOptional()
  @IsBoolean()
  assignAnyProfessional?: boolean;
}
