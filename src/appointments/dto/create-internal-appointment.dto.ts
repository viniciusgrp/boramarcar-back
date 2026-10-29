import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { IsBrazilianPhone } from '../../common/validators/is-brazilian-phone.validator';
import {
  MAX_APPOINTMENT_DURATION_MINUTES,
  MIN_APPOINTMENT_DURATION_MINUTES,
} from '../utils/appointment-duration.util';

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

  /**
   * Overrides the summed service duration for this appointment only.
   * Omitted values keep the catalog total.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_APPOINTMENT_DURATION_MINUTES)
  @Max(MAX_APPOINTMENT_DURATION_MINUTES)
  durationMinutes?: number;
}
