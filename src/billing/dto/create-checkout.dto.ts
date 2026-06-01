import type { PlanTier } from '../../tenants/entities/plan-tier.type';

export class CreateCheckoutDto {
  planTier?: PlanTier;
}
