import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
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
