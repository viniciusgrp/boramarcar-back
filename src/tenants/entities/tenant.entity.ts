import type { PlanTier } from './plan-tier.type';
import type { SubscriptionStatus } from './subscription-status.type';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  contact_phone: string | null;
  require_deposit: boolean;
  owner_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: SubscriptionStatus;
  subscription_expires_at: string | null;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  plan_tier: PlanTier;
  created_at: string;
  updated_at: string;
}
