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

export class CreateInternalAppointmentDto {
  @IsUUID()
  professionalId!: string;

  /** @deprecated Use serviceIds. Kept for backward compatibility. */
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  serviceIds?: string[];

  @IsISO8601()
  startTime!: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  customerName?: string;

  @IsOptional()
  @IsString()
  @IsBrazilianPhone()
  customerPhone?: string;

  @IsOptional()
  @IsBoolean()
  forceSchedule?: boolean;
}
