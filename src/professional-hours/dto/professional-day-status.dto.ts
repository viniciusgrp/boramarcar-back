import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export type ProfessionalWorkStatus = 'working' | 'off';

export class ProfessionalDayStatusDto {
  @IsUUID()
  professionalId!: string;

  @IsEnum(['working', 'off'] as const)
  status!: ProfessionalWorkStatus;

  @IsOptional()
  @IsString()
  openTime!: string | null;

  @IsOptional()
  @IsString()
  closeTime!: string | null;
}
