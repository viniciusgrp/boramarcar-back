import { IsEnum } from 'class-validator';
import type { PlanTier } from '../../tenants/entities/plan-tier.type';

export class ChangePlanDto {
  @IsEnum(['SOLO', 'PRO', 'ELITE'] as const)
  planTier!: PlanTier;
}
