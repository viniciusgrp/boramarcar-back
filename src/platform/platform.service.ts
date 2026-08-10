import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { SupabaseService } from '../supabase/supabase.service';
import type { PlanTier } from '../tenants/entities/plan-tier.type';
import type { Tenant } from '../tenants/entities/tenant.entity';
import {
  extractSubscriptionPeriodEnd,
  stripePeriodEndToIso,
} from '../billing/utils/stripe-period-end.util';
import type {
  PlatformGrowthPoint,
  PlatformSummaryResponse,
  PlatformTenantDetail,
  PlatformTenantListItem,
  PlatformTenantListResponse,
  PlatformTenantUsage,
} from './dto/platform-responses.dto';
import {
  formatMonthLabel,
  matchesAccessFilter,
  matchesPlanFilter,
  matchesSearch,
  resolvePlatformAccessLabel,
  toMonthKey,
} from './utils/platform-access.util';

type StripeClient = InstanceType<typeof Stripe>;

interface ListTenantsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  plan?: string;
}

@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);
  private readonly stripe: StripeClient | null;
  private planPriceCentsCache: Partial<Record<PlanTier, number>> | null = null;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.stripe = secretKey?.trim() ? new Stripe(secretKey) : null;
  }

  async listTenants(
    query: ListTenantsQuery,
  ): Promise<PlatformTenantListResponse> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));

    const tenants = await this.fetchAllTenants();
    const ownerEmails = await this.resolveOwnerEmails(
      tenants.map((t) => t.owner_id).filter((id): id is string => Boolean(id)),
    );

    const filtered = tenants.filter((tenant) => {
      const label = resolvePlatformAccessLabel(tenant);
      const ownerEmail = tenant.owner_id
        ? (ownerEmails.get(tenant.owner_id) ?? null)
        : null;

      return (
        matchesAccessFilter(label, query.status) &&
        matchesPlanFilter(tenant.plan_tier, query.plan) &&
        matchesSearch(tenant, ownerEmail, query.search)
      );
    });

    filtered.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const slice = filtered.slice(start, start + pageSize);

    const items: PlatformTenantListItem[] = slice.map((tenant) => {
      const ownerEmail = tenant.owner_id
        ? (ownerEmails.get(tenant.owner_id) ?? null)
        : null;

      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        contactPhone: tenant.contact_phone,
        ownerEmail,
        planTier: tenant.plan_tier,
        subscriptionStatus: tenant.subscription_status,
        trialEndsAt: tenant.trial_ends_at,
        createdAt: tenant.created_at,
        accessLabel: resolvePlatformAccessLabel(tenant),
      };
    });

    return { items, total, page, pageSize };
  }

  async getTenantDetail(tenantId: string): Promise<PlatformTenantDetail> {
    const tenant = await this.fetchTenantById(tenantId);
    const ownerEmail = tenant.owner_id
      ? await this.resolveUserEmail(tenant.owner_id)
      : null;

    const [usage, loyaltyActive, loginActivity, subscriptionExtras] =
      await Promise.all([
        this.computeUsage(tenant.id),
        this.isLoyaltyActive(tenant.id),
        this.resolveLoginActivity(tenant.id, tenant.owner_id),
        this.resolveStripeSubscriptionExtras(tenant.stripe_subscription_id),
      ]);

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      description: tenant.description,
      logoUrl: tenant.logo_url,
      contact: {
        phone: tenant.contact_phone,
        ownerEmail,
        address: {
          cep: tenant.address_cep,
          street: tenant.address_street,
          number: tenant.address_number,
          complement: tenant.address_complement,
          neighborhood: tenant.address_neighborhood,
          city: tenant.address_city,
          state: tenant.address_state,
        },
      },
      subscription: {
        status: tenant.subscription_status,
        planTier: tenant.plan_tier,
        trialEndsAt: tenant.trial_ends_at,
        subscriptionExpiresAt: tenant.subscription_expires_at,
        stripeCustomerId: tenant.stripe_customer_id,
        stripeSubscriptionId: tenant.stripe_subscription_id,
        monthlyAmountCents: subscriptionExtras.monthlyAmountCents,
        currency: subscriptionExtras.currency,
        nextBillingAt:
          subscriptionExtras.nextBillingAt ?? tenant.subscription_expires_at,
      },
      usage,
      engagement: {
        hasContactPhone: Boolean(tenant.contact_phone?.trim()),
        loyaltyActive,
        referralProgramEnabled: tenant.enable_referral_program,
        supportAiEnabled: tenant.support_ai_enabled,
        reviewsEnabled: tenant.reviews_enabled,
        depositFeatureEnabled: tenant.deposit_feature_enabled,
        initialSetupCompleted: Boolean(tenant.initial_setup_completed_at),
      },
      loginActivity,
      createdAt: tenant.created_at,
      updatedAt: tenant.updated_at,
      accessLabel: resolvePlatformAccessLabel(tenant),
    };
  }

  async getSummary(): Promise<PlatformSummaryResponse> {
    const tenants = await this.fetchAllTenants();
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );

    const byAccess = {
      active: 0,
      trial: 0,
      pastDue: 0,
      canceled: 0,
      inactive: 0,
    };
    const byPlan = { SOLO: 0, PRO: 0, ELITE: 0 };
    let newTenantsThisMonth = 0;

    for (const tenant of tenants) {
      const label = resolvePlatformAccessLabel(tenant, now);
      if (label === 'active') byAccess.active += 1;
      else if (label === 'trial') byAccess.trial += 1;
      else if (label === 'past_due') byAccess.pastDue += 1;
      else if (label === 'canceled') byAccess.canceled += 1;
      else byAccess.inactive += 1;

      if (tenant.plan_tier in byPlan) {
        byPlan[tenant.plan_tier] += 1;
      }

      if (new Date(tenant.created_at).getTime() >= monthStart.getTime()) {
        newTenantsThisMonth += 1;
      }
    }

    const planPrices = await this.getPlanPriceCents();
    let estimatedMrrCents = 0;
    for (const tenant of tenants) {
      if (tenant.subscription_status !== 'ACTIVE') {
        continue;
      }
      estimatedMrrCents += planPrices[tenant.plan_tier] ?? 0;
    }

    return {
      totalTenants: tenants.length,
      byAccess,
      byPlan,
      newTenantsThisMonth,
      estimatedMrrCents,
      estimatedMrrCurrency: 'brl',
      growthByMonth: this.buildGrowthSeries(tenants),
    };
  }

  private async fetchAllTenants(): Promise<Tenant[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data as Tenant[]) ?? [];
  }

  private async fetchTenantById(tenantId: string): Promise<Tenant> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Cliente não encontrado.');
    }

    return data as Tenant;
  }

  private async computeUsage(tenantId: string): Promise<PlatformTenantUsage> {
    const client = this.supabaseService.getClient();
    const since30d = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const [
      appointmentsTotal,
      appointmentsLast30Days,
      professionalsCount,
      servicesCount,
      customersCount,
      teamUsersCount,
      lastAppointment,
      revenueTotal,
      revenueLast30Days,
    ] = await Promise.all([
      this.countRows('appointments', tenantId),
      this.countRows('appointments', tenantId, {
        column: 'start_time',
        gte: since30d,
      }),
      this.countRows('professionals', tenantId, {
        column: 'deleted_at',
        is: null,
      }),
      this.countRows('services', tenantId),
      this.countRows('customers', tenantId),
      this.countRows('tenant_users', tenantId),
      client
        .from('appointments')
        .select('start_time')
        .eq('tenant_id', tenantId)
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle(),
      this.sumRevenue(tenantId),
      this.sumRevenue(tenantId, since30d),
    ]);

    if (lastAppointment.error) {
      throw new InternalServerErrorException(lastAppointment.error.message);
    }

    return {
      appointmentsTotal,
      appointmentsLast30Days,
      professionalsCount,
      servicesCount,
      customersCount,
      teamUsersCount,
      lastAppointmentAt:
        (lastAppointment.data?.start_time as string | undefined) ?? null,
      revenueTotal,
      revenueLast30Days,
    };
  }

  private async countRows(
    table: string,
    tenantId: string,
    filter?: {
      column: string;
      gte?: string;
      is?: null;
    },
  ): Promise<number> {
    let query = this.supabaseService
      .getClient()
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    if (filter?.gte) {
      query = query.gte(filter.column, filter.gte);
    }

    if (filter && 'is' in filter && filter.is === null) {
      query = query.is(filter.column, null);
    }

    const { count, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return count ?? 0;
  }

  private async sumRevenue(
    tenantId: string,
    sinceIso?: string,
  ): Promise<number> {
    let query = this.supabaseService
      .getClient()
      .from('cash_flow_entries')
      .select('amount')
      .eq('tenant_id', tenantId)
      .eq('type', 'REVENUE');

    if (sinceIso) {
      query = query.gte('created_at', sinceIso);
    }

    const { data, error } = await query;

    if (error) {
      // Tabela pode não existir em ambientes muito antigos; não quebrar o painel.
      this.logger.warn(`sumRevenue failed for ${tenantId}: ${error.message}`);
      return 0;
    }

    let total = 0;
    for (const row of data ?? []) {
      total += Number(row.amount ?? 0);
    }

    return Math.round(total * 100) / 100;
  }

  private async isLoyaltyActive(tenantId: string): Promise<boolean> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('loyalty_settings')
      .select('is_active')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      this.logger.warn(`loyalty lookup failed: ${error.message}`);
      return false;
    }

    return Boolean(data?.is_active);
  }

  private async resolveLoginActivity(
    tenantId: string,
    ownerId: string | null,
  ): Promise<{
    ownerLastSignInAt: string | null;
    teamLastSignInAt: string | null;
    teamUsersWithLogin: number;
  }> {
    const { data: tenantUsers, error } = await this.supabaseService
      .getClient()
      .from('tenant_users')
      .select('user_id')
      .eq('tenant_id', tenantId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const userIds = new Set<string>();
    for (const row of tenantUsers ?? []) {
      if (row.user_id) {
        userIds.add(row.user_id as string);
      }
    }
    if (ownerId) {
      userIds.add(ownerId);
    }

    let ownerLastSignInAt: string | null = null;
    let teamLastSignInAt: string | null = null;
    let teamUsersWithLogin = 0;

    await Promise.all(
      [...userIds].map(async (userId) => {
        const lastSignIn = await this.resolveUserLastSignIn(userId);
        if (!lastSignIn) {
          return;
        }

        teamUsersWithLogin += 1;

        if (
          !teamLastSignInAt ||
          new Date(lastSignIn).getTime() > new Date(teamLastSignInAt).getTime()
        ) {
          teamLastSignInAt = lastSignIn;
        }

        if (ownerId && userId === ownerId) {
          ownerLastSignInAt = lastSignIn;
        }
      }),
    );

    return { ownerLastSignInAt, teamLastSignInAt, teamUsersWithLogin };
  }

  private async resolveUserLastSignIn(userId: string): Promise<string | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .auth.admin.getUserById(userId);

    if (error || !data.user) {
      return null;
    }

    return data.user.last_sign_in_at ?? null;
  }

  private async resolveUserEmail(userId: string): Promise<string | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .auth.admin.getUserById(userId);

    if (error || !data.user) {
      return null;
    }

    return data.user.email ?? null;
  }

  private async resolveOwnerEmails(
    ownerIds: string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ownerIds)];
    const map = new Map<string, string>();

    await Promise.all(
      unique.map(async (ownerId) => {
        const email = await this.resolveUserEmail(ownerId);
        if (email) {
          map.set(ownerId, email);
        }
      }),
    );

    return map;
  }

  private async resolveStripeSubscriptionExtras(
    stripeSubscriptionId: string | null,
  ): Promise<{
    monthlyAmountCents: number | null;
    currency: string | null;
    nextBillingAt: string | null;
  }> {
    if (!stripeSubscriptionId || !this.stripe) {
      return {
        monthlyAmountCents: null,
        currency: null,
        nextBillingAt: null,
      };
    }

    try {
      const subscription = await this.stripe.subscriptions.retrieve(
        stripeSubscriptionId,
        { expand: ['items.data.price'] },
      );

      const item = subscription.items.data[0];
      const unitAmount = item?.price?.unit_amount ?? null;
      const quantity = item?.quantity ?? 1;
      const currency = item?.price?.currency ?? null;
      const nextBillingAt = stripePeriodEndToIso(
        extractSubscriptionPeriodEnd(subscription),
      );

      return {
        monthlyAmountCents:
          unitAmount === null ? null : unitAmount * (quantity || 1),
        currency,
        nextBillingAt,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to retrieve Stripe subscription ${stripeSubscriptionId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return {
        monthlyAmountCents: null,
        currency: null,
        nextBillingAt: null,
      };
    }
  }

  private async getPlanPriceCents(): Promise<Partial<Record<PlanTier, number>>> {
    if (this.planPriceCentsCache) {
      return this.planPriceCentsCache;
    }

    const result: Partial<Record<PlanTier, number>> = {};

    if (!this.stripe) {
      this.planPriceCentsCache = result;
      return result;
    }

    const priceIds: Array<{ tier: PlanTier; envKey: string }> = [
      { tier: 'SOLO', envKey: 'STRIPE_SOLO_PRICE_ID' },
      { tier: 'PRO', envKey: 'STRIPE_PRO_TIER_PRICE_ID' },
      { tier: 'ELITE', envKey: 'STRIPE_ELITE_PRICE_ID' },
    ];

    await Promise.all(
      priceIds.map(async ({ tier, envKey }) => {
        const priceId = this.configService.get<string>(envKey)?.trim();
        if (!priceId) {
          return;
        }

        try {
          const price = await this.stripe!.prices.retrieve(priceId);
          if (typeof price.unit_amount === 'number') {
            result[tier] = price.unit_amount;
          }
        } catch (error) {
          this.logger.warn(
            `Failed to retrieve Stripe price ${priceId}: ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
          );
        }
      }),
    );

    this.planPriceCentsCache = result;
    return result;
  }

  private buildGrowthSeries(tenants: Tenant[]): PlatformGrowthPoint[] {
    const sorted = [...tenants].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    const counts = new Map<string, number>();
    for (const tenant of sorted) {
      const key = toMonthKey(tenant.created_at);
      if (key === 'unknown') {
        continue;
      }
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const now = new Date();
    const months: string[] = [];
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      months.push(key);
    }

    let cumulative = 0;
    const earliest = months[0];
    for (const tenant of sorted) {
      const key = toMonthKey(tenant.created_at);
      if (key !== 'unknown' && key < earliest) {
        cumulative += 1;
      }
    }

    return months.map((month) => {
      const newTenants = counts.get(month) ?? 0;
      cumulative += newTenants;
      return {
        month,
        label: formatMonthLabel(month),
        newTenants,
        cumulativeTenants: cumulative,
      };
    });
  }
}
