import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import type { AffiliatePixKeyType } from '../entities/affiliate.entity';

export class RegisterAffiliateDto {
  @IsString()
  @IsNotEmpty()
  full_name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @IsNotEmpty()
  cpf!: string;

  @IsOptional()
  @IsString()
  cnpj?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @IsNotEmpty()
  pix_key!: string;

  @IsIn(['cpf', 'cnpj', 'email', 'phone', 'random'])
  pix_key_type!: AffiliatePixKeyType;

  @IsString()
  @IsNotEmpty()
  terms_version!: string;

  @IsBoolean()
  @Equals(true)
  ack_independent_partnership!: boolean;

  @IsBoolean()
  @Equals(true)
  ack_autonomy!: boolean;

  @IsBoolean()
  @Equals(true)
  ack_result_only_pay!: boolean;

  @IsBoolean()
  @Equals(true)
  ack_own_taxes!: boolean;

  @IsBoolean()
  @Equals(true)
  ack_no_employment!: boolean;
}

export class UpdateAffiliateMeDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  full_name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  cnpj?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  pix_key?: string;

  @IsOptional()
  @IsIn(['cpf', 'cnpj', 'email', 'phone', 'random'])
  pix_key_type?: AffiliatePixKeyType;
}

export class TrackAffiliateClickDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsOptional()
  @IsString()
  landing_path?: string;
}

export class UpdateAffiliateStatusDto {
  @IsIn(['active', 'suspended', 'rejected', 'pending_review'])
  status!: 'active' | 'suspended' | 'rejected' | 'pending_review';

  @IsOptional()
  @IsString()
  notes?: string;
}

export class MarkAffiliatePayoutPaidDto {
  @IsOptional()
  @IsString()
  external_ref?: string;
}
