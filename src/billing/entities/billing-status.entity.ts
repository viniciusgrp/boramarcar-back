import type { PlanTier } from '../../tenants/entities/plan-tier.type';
import type { SubscriptionStatus } from '../../tenants/entities/subscription-status.type';

export interface DepositChargeAlert {
  active: boolean;
  message: string | null;
}

export interface RetentionOffer {
  targetPlanTier: 'SOLO';
  monthlyValueBrl: number;
  available: boolean;
  alreadyScheduled: boolean;
  effectiveAt: string | null;
}

export interface BillingStatusResponse {
  planTier: PlanTier;
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiresAt: string | null;
  subscriptionCancelAt: string | null;
  cancelAtPeriodEnd: boolean;
  pendingPlanTier: PlanTier | null;
  pendingPlanPaymentId: string | null;
  pendingPlanInvoiceUrl: string | null;
  pendingPlanEffectiveAt: string | null;
  canChargeDeposits: boolean;
  depositChargeAlert: DepositChargeAlert;
  retentionOffer: RetentionOffer;
}
