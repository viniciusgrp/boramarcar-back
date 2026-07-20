import {
  IsArray,
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class RescheduleAppointmentDto {
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

  @IsISO8601()
  startTime!: string;

  @IsOptional()
  @IsBoolean()
  assignAnyProfessional?: boolean;
}
