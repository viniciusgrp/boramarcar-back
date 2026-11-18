import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PLAN_TIERS, type PlanTier } from '../../tenants/entities/plan-tier.type';

export class ExtendPlatformTrialDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;
}

export class GrantPlatformPlanDto {
  @IsIn([...PLAN_TIERS])
  planTier!: PlanTier;

  @IsISO8601()
  until!: string;
}

export class DeletePlatformTenantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  confirmName!: string;
}

export class BulkDeletePlatformTenantsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  ids!: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  confirmPhrase!: string;
}

export class PlatformPassphraseLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  passphrase!: string;
}
