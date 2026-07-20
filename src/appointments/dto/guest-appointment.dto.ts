import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class GuestAppointmentLookupEntryDto {
  @IsUUID()
  appointmentId!: string;

  @IsString()
  accessToken!: string;
}

export class GuestAppointmentLookupDto {
  @IsUUID()
  tenantId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuestAppointmentLookupEntryDto)
  entries!: GuestAppointmentLookupEntryDto[];

  @IsEnum(['upcoming', 'past'] as const)
  scope!: 'upcoming' | 'past';
}

export class GuestAppointmentCancelDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  accessToken!: string;
}

export class GuestAppointmentRescheduleDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  accessToken!: string;

  @IsOptional()
  @IsUUID()
  professionalId?: string;

  /** @deprecated Use serviceIds. */
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
