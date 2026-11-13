import type { PlanTier } from '../../tenants/entities/plan-tier.type';
import type { Tenant } from '../../tenants/entities/tenant.entity';
import type { PlanChangeDirection } from '../utils/plan-change-proration.util';

export interface ChangePlanPreview {
  direction: PlanChangeDirection;
  currentPlanTier: PlanTier;
  targetPlanTier: PlanTier;
  currentMonthlyValueBrl: number;
  targetMonthlyValueBrl: number;
  proratedAmountBrl: number | null;
  chargeAmountBrl: number;
  belowAsaasMinimum: boolean;
  minimumChargeBrl: number;
  effectiveAt: string | null;
  appliesImmediately: boolean;
}

export interface ChangePlanResult extends ChangePlanPreview {
  tenant: Tenant;
  invoiceUrl: string | null;
  applied: boolean;
}
