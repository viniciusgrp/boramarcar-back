import { IsISO8601, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CompleteCustomerProfileDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @MinLength(1)
  phone!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsISO8601()
  birthDate?: string;

  @IsOptional()
  @IsString()
  instagramHandle?: string;

  @IsOptional()
  @IsString()
  acquisitionSource?: string;

  @IsOptional()
  @IsString()
  referralCode?: string;
}
