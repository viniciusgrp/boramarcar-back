import { IsEnum, IsOptional } from 'class-validator';
import type { PlanTier } from '../../tenants/entities/plan-tier.type';

export class CreateCheckoutDto {
  @IsOptional()
  @IsEnum(['SOLO', 'PRO', 'ELITE'] as const)
  planTier?: PlanTier;
}
