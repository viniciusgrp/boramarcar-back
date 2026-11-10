import { IsNotEmpty, IsOptional, IsString, MaxLength, IsISO8601 } from 'class-validator';

export class OnboardTenantDto {
  @IsString()
  @IsNotEmpty()
  owner_name!: string;

  @IsString()
  @IsNotEmpty()
  tenant_name!: string;

  @IsString()
  @IsNotEmpty()
  slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  affiliate_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  utm_source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  utm_medium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  utm_campaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  utm_content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  fbclid?: string;

  @IsOptional()
  @IsISO8601()
  first_visit_at?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  event_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  fbp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  fbc?: string;
}
