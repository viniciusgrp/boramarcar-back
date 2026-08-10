import type { PlanTier } from '../../tenants/entities/plan-tier.type';
import type { SubscriptionStatus } from '../../tenants/entities/subscription-status.type';

export interface PlatformTenantListItem {
  id: string;
  name: string;
  slug: string;
  contactPhone: string | null;
  ownerEmail: string | null;
  planTier: PlanTier;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: string | null;
  createdAt: string;
  accessLabel: 'active' | 'trial' | 'past_due' | 'canceled' | 'inactive';
}

export interface PlatformTenantListResponse {
  items: PlatformTenantListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PlatformTenantUsage {
  appointmentsTotal: number;
  appointmentsLast30Days: number;
  professionalsCount: number;
  servicesCount: number;
  customersCount: number;
  teamUsersCount: number;
  lastAppointmentAt: string | null;
  revenueTotal: number;
  revenueLast30Days: number;
}

export interface PlatformTenantEngagement {
  hasContactPhone: boolean;
  loyaltyActive: boolean;
  referralProgramEnabled: boolean;
  supportAiEnabled: boolean;
  reviewsEnabled: boolean;
  depositFeatureEnabled: boolean;
  initialSetupCompleted: boolean;
}

export interface PlatformTenantLoginActivity {
  ownerLastSignInAt: string | null;
  teamLastSignInAt: string | null;
  teamUsersWithLogin: number;
}

export interface PlatformTenantSubscriptionDetail {
  status: SubscriptionStatus;
  planTier: PlanTier;
  trialEndsAt: string | null;
  subscriptionExpiresAt: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  monthlyAmountCents: number | null;
  currency: string | null;
  nextBillingAt: string | null;
}

export interface PlatformTenantDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  contact: {
    phone: string | null;
    ownerEmail: string | null;
    address: {
      cep: string | null;
      street: string | null;
      number: string | null;
      complement: string | null;
      neighborhood: string | null;
      city: string | null;
      state: string | null;
    };
  };
  subscription: PlatformTenantSubscriptionDetail;
  usage: PlatformTenantUsage;
  engagement: PlatformTenantEngagement;
  loginActivity: PlatformTenantLoginActivity;
  createdAt: string;
  updatedAt: string;
  accessLabel: 'active' | 'trial' | 'past_due' | 'canceled' | 'inactive';
}

export interface PlatformGrowthPoint {
  month: string;
  label: string;
  newTenants: number;
  cumulativeTenants: number;
}

export interface PlatformSummaryResponse {
  totalTenants: number;
  byAccess: {
    active: number;
    trial: number;
    pastDue: number;
    canceled: number;
    inactive: number;
  };
  byPlan: {
    SOLO: number;
    PRO: number;
    ELITE: number;
  };
  newTenantsThisMonth: number;
  estimatedMrrCents: number;
  estimatedMrrCurrency: string;
  growthByMonth: PlatformGrowthPoint[];
}
