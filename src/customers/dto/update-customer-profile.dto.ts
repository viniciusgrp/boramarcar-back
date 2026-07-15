import { IsISO8601, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class UpdateCustomerProfileDto {
  @IsUUID()
  tenantId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  profilePictureUrl?: string | null;

  @IsOptional()
  @IsString()
  instagramHandle?: string | null;

  @IsOptional()
  @IsISO8601()
  birthDate?: string | null;
}
