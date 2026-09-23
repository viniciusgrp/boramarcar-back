import {
  BadRequestException,
  ConflictException,
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
  isComplimentaryAccessActive,
  parseUtcInstant,
} from '../tenants/utils/tenant-access.util';
import {
  extractSubscriptionPeriodEnd,
  stripePeriodEndToIso,
} from '../billing/utils/stripe-period-end.util';
import type {
  PlatformApiErrorEvent,
  PlatformAppointmentListItem,
  PlatformBusinessHour,
  PlatformGrowthPoint,
  PlatformPagedResponse,
  PlatformServiceListItem,
  PlatformSummaryResponse,
  PlatformTenantDetail,
  PlatformTenantListItem,
  PlatformTenantListResponse,
  PlatformTenantSettings,
  PlatformTenantTeamResponse,
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

function parsePage(
  page?: number,
  pageSize?: number,
): { page: number; pageSize: number; from: number; to: number } {
  const safePage = Math.max(1, page ?? 1);
  const safePageSize = Math.min(100, Math.max(1, pageSize ?? 20));
  const from = (safePage - 1) * safePageSize;
  return {
    page: safePage,
    pageSize: safePageSize,
    from,
    to: from + safePageSize - 1,
  };
}

function uniqueIds(values: unknown[]): string[] {
  return [
    ...new Set(
      values.filter((value): value is string => typeof value === 'string' && value.length > 0),
    ),
  ];
}

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

    const [usage, loyaltyActive, loginActivity, subscriptionExtras, recentApiErrors, businessHours] =
      await Promise.all([
        this.computeUsage(tenant.id),
        this.isLoyaltyActive(tenant.id),
        this.resolveLoginActivity(tenant.id, tenant.owner_id),
        this.resolveStripeSubscriptionExtras(tenant.stripe_subscription_id),
        this.fetchRecentApiErrors(tenant.id),
        this.fetchBusinessHours(tenant.id),
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
        compUntil: tenant.comp_until,
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
      recentApiErrors,
      settings: this.buildSettings(tenant, businessHours),
      createdAt: tenant.created_at,
      updatedAt: tenant.updated_at,
      accessLabel: resolvePlatformAccessLabel(tenant),
    };
  }

  async listAppointments(
    tenantId: string,
    query: { page?: number; pageSize?: number },
  ): Promise<PlatformPagedResponse<PlatformAppointmentListItem>> {
    await this.fetchTenantById(tenantId);
    const { page, pageSize, from, to } = parsePage(query.page, query.pageSize);

    const { data, error, count } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select(
        'id, start_time, end_time, status, customer_name, professional_id, service_id',
        { count: 'exact' },
      )
      .eq('tenant_id', tenantId)
      .order('start_time', { ascending: false })
      .range(from, to);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = data ?? [];
    const professionalIds = uniqueIds(rows.map((row) => row.professional_id));
    const serviceIds = uniqueIds(rows.map((row) => row.service_id));
    const [professionals, services] = await Promise.all([
      this.loadNameMap('professionals', professionalIds),
      this.loadNameMap('services', serviceIds),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id as string,
        startTime: row.start_time as string,
        endTime: row.end_time as string,
        status: row.status as string,
        customerName: (row.customer_name as string) ?? '',
        professionalName: professionals.get(row.professional_id as string) ?? null,
        serviceName: services.get(row.service_id as string) ?? null,
      })),
      total: count ?? 0,
      page,
      pageSize,
    };
  }

  async listServices(
    tenantId: string,
    query: { page?: number; pageSize?: number },
  ): Promise<PlatformPagedResponse<PlatformServiceListItem>> {
    await this.fetchTenantById(tenantId);
    const { page, pageSize, from, to } = parsePage(query.page, query.pageSize);

    const { data, error, count } = await this.supabaseService
      .getClient()
      .from('services')
      .select('id, name, duration_minutes, price, is_active, created_at, updated_at', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true })
      .range(from, to);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return {
      items: (data ?? []).map((row) => ({
        id: row.id as string,
        name: row.name as string,
        durationMinutes: Number(row.duration_minutes ?? 0),
        price: Number(row.price ?? 0),
        isActive: Boolean(row.is_active),
        createdAt: (row.created_at as string | null) ?? null,
        updatedAt: (row.updated_at as string | null) ?? null,
      })),
      total: count ?? 0,
      page,
      pageSize,
    };
  }

  async getTeam(tenantId: string): Promise<PlatformTenantTeamResponse> {
    await this.fetchTenantById(tenantId);
    const client = this.supabaseService.getClient();

    const [professionalsResult, usersResult] = await Promise.all([
      client
        .from('professionals')
        .select('id, name, contact_phone, is_active, created_at, updated_at')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order('name', { ascending: true }),
      client
        .from('tenant_users')
        .select('id, user_id, role, professional_id, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true }),
    ]);

    if (professionalsResult.error) {
      throw new InternalServerErrorException(professionalsResult.error.message);
    }
    if (usersResult.error) {
      throw new InternalServerErrorException(usersResult.error.message);
    }

    const professionals = (professionalsResult.data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      contactPhone: (row.contact_phone as string | null) ?? null,
      isActive: Boolean(row.is_active),
      createdAt: (row.created_at as string | null) ?? null,
      updatedAt: (row.updated_at as string | null) ?? null,
    }));

    const professionalNames = new Map(
      professionals.map((item) => [item.id, item.name]),
    );

    const users = await Promise.all(
      (usersResult.data ?? []).map(async (row) => {
        const userId = row.user_id as string;
        const [email, lastSignInAt] = await Promise.all([
          this.resolveUserEmail(userId),
          this.resolveUserLastSignIn(userId),
        ]);
        const professionalId = (row.professional_id as string | null) ?? null;

        return {
          id: row.id as string,
          email,
          role: row.role as string,
          professionalName: professionalId
            ? (professionalNames.get(professionalId) ?? null)
            : null,
          lastSignInAt,
          createdAt: (row.created_at as string | null) ?? null,
        };
      }),
    );

    return { professionals, users };
  }

  async extendTrial(tenantId: string, days: number): Promise<PlatformTenantDetail> {
    const tenant = await this.fetchTenantById(tenantId);
    const now = Date.now();
    const currentEnd = parseUtcInstant(tenant.trial_ends_at);
    const base =
      currentEnd && currentEnd.getTime() > now ? currentEnd : new Date();
    const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
    const fields: Record<string, string | null> = { trial_ends_at: next };

    if (isComplimentaryAccessActive(tenant) || tenant.comp_until === tenant.trial_ends_at) {
      fields.comp_until = next;
    }

    await this.updateTenantFields(tenantId, fields);
    return this.getTenantDetail(tenantId);
  }

  async grantPlan(
    tenantId: string,
    planTier: PlanTier,
    untilIso: string,
  ): Promise<PlatformTenantDetail> {
    const until = parseUtcInstant(untilIso);
    if (!until || until.getTime() <= Date.now()) {
      throw new BadRequestException('A data de término precisa ser futura.');
    }

    const tenant = await this.fetchTenantById(tenantId);
    const untilValue = until.toISOString();

    await this.updateTenantFields(tenantId, {
      plan_tier: planTier,
      subscription_status: 'INACTIVE',
      trial_ends_at: untilValue,
      comp_until: untilValue,
    });

    await this.cancelStripeSubscription(tenant.stripe_subscription_id);
    return this.getTenantDetail(tenantId);
  }

  async cancelPlan(tenantId: string): Promise<PlatformTenantDetail> {
    const tenant = await this.fetchTenantById(tenantId);

    await this.updateTenantFields(tenantId, { comp_until: null });
    await this.cancelStripeSubscription(tenant.stripe_subscription_id);

    await this.updateTenantFields(tenantId, {
      subscription_status: 'CANCELED',
      plan_tier: 'SOLO',
      trial_ends_at: null,
      stripe_subscription_id: null,
      comp_until: null,
    });

    return this.getTenantDetail(tenantId);
  }

  async deleteAppointment(tenantId: string, appointmentId: string): Promise<void> {
    await this.fetchTenantById(tenantId);
    await this.deleteOwnedRow('appointments', tenantId, appointmentId);
  }

  async deleteService(tenantId: string, serviceId: string): Promise<void> {
    await this.fetchTenantById(tenantId);
    await this.assertNoLinkedAppointments(tenantId, 'service_id', serviceId);
    await this.deleteOwnedRow('services', tenantId, serviceId);
  }

  async deleteProfessional(
    tenantId: string,
    professionalId: string,
  ): Promise<void> {
    await this.fetchTenantById(tenantId);
    await this.assertNoLinkedAppointments(
      tenantId,
      'professional_id',
      professionalId,
    );
    await this.deleteOwnedRow('professionals', tenantId, professionalId);
  }

  async deleteTenant(tenantId: string, confirmName: string): Promise<void> {
    const tenant = await this.fetchTenantById(tenantId);
    if (confirmName.trim() !== tenant.name) {
      throw new BadRequestException(
        'Digite o nome do estabelecimento para confirmar a exclusão.',
      );
    }

    await this.cancelStripeSubscription(tenant.stripe_subscription_id);

    const authUserIds = await this.listAuthUserIdsForTenant(tenantId);

    await this.deleteByTenantId('appointments', tenantId);
    await this.deleteByTenantId('product_sale_items', tenantId);
    await this.deleteByTenantId('service_products', tenantId);
    await this.deleteByTenantId('affiliate_commission_items', tenantId);

    const { error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .delete()
      .eq('id', tenantId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    await this.deleteAuthUsersIfOrphaned(authUserIds);
  }

  async purgeOrphanedAuthUsers(): Promise<{ scanned: number; deleted: number }> {
    let scanned = 0;
    let deleted = 0;
    let page = 1;
    const perPage = 200;

    while (page <= 50) {
      const { data, error } = await this.supabaseService
        .getClient()
        .auth.admin.listUsers({ page, perPage });

      if (error) {
        throw new InternalServerErrorException(error.message);
      }

      const users = data.users ?? [];
      scanned += users.length;

      for (const user of users) {
        const removed = await this.deleteAuthUsersIfOrphaned([user.id]);
        deleted += removed;
      }

      if (users.length < perPage) {
        break;
      }

      page += 1;
    }

    return { scanned, deleted };
  }

  private async listAuthUserIdsForTenant(tenantId: string): Promise<string[]> {
    const members = await this.supabaseService
      .getClient()
      .from('tenant_users')
      .select('user_id')
      .eq('tenant_id', tenantId);

    if (members.error) {
      throw new InternalServerErrorException(members.error.message);
    }

    const customers = await this.supabaseService
      .getClient()
      .from('customers')
      .select('auth_user_id')
      .eq('tenant_id', tenantId);

    if (customers.error) {
      throw new InternalServerErrorException(customers.error.message);
    }

    return uniqueIds([
      ...(members.data ?? []).map((row) => row.user_id),
      ...(customers.data ?? []).map((row) => row.auth_user_id),
    ]);
  }

  private async isAuthUserStillLinked(userId: string): Promise<boolean> {
    const checks: Array<{ table: string; column: string }> = [
      { table: 'tenant_users', column: 'user_id' },
      { table: 'platform_admins', column: 'user_id' },
      { table: 'affiliates', column: 'auth_user_id' },
      { table: 'customers', column: 'auth_user_id' },
    ];

    for (const check of checks) {
      const { count, error } = await this.supabaseService
        .getClient()
        .from(check.table)
        .select('id', { count: 'exact', head: true })
        .eq(check.column, userId);

      if (error) {
        throw new InternalServerErrorException(error.message);
      }

      if ((count ?? 0) > 0) {
        return true;
      }
    }

    return false;
  }

  private async deleteAuthUsersIfOrphaned(userIds: string[]): Promise<number> {
    let deleted = 0;

    for (const userId of uniqueIds(userIds)) {
      if (await this.isAuthUserStillLinked(userId)) {
        continue;
      }

      const { error } = await this.supabaseService
        .getClient()
        .auth.admin.deleteUser(userId);

      if (error) {
        this.logger.warn(
          `Failed to delete orphaned auth user ${userId}: ${error.message}`,
        );
        continue;
      }

      deleted += 1;
    }

    return deleted;
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

  private async fetchRecentApiErrors(
    tenantId: string,
  ): Promise<PlatformApiErrorEvent[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('api_error_events')
      .select(
        'id, method, path, status_code, exception_name, message, created_at',
      )
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      this.logger.warn(`Failed to load api_error_events: ${error.message}`);
      return [];
    }

    return (data ?? []).map((row) => ({
      id: row.id as string,
      method: row.method as string,
      path: row.path as string,
      statusCode: row.status_code as number,
      exceptionName: (row.exception_name as string | null) ?? null,
      message: (row.message as string | null) ?? null,
      createdAt: row.created_at as string,
    }));
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

  private buildSettings(
    tenant: Tenant,
    businessHours: PlatformBusinessHour[],
  ): PlatformTenantSettings {
    return {
      requireCustomerEmailConfirmation: tenant.require_customer_email_confirmation,
      requireCustomerAccount: tenant.require_customer_account,
      allowCustomerSelfCancellation: tenant.allow_customer_self_cancellation,
      allowCustomerReschedule: tenant.allow_customer_reschedule,
      bookingAcceptanceType: tenant.booking_acceptance_type,
      bookingSlotIntervalMinutes: tenant.booking_slot_interval_minutes,
      depositFeatureEnabled: tenant.deposit_feature_enabled,
      reviewsEnabled: tenant.reviews_enabled,
      reviewsAutoPublish: tenant.reviews_auto_publish,
      referralProgramEnabled: tenant.enable_referral_program,
      businessHours,
    };
  }

  private async fetchBusinessHours(
    tenantId: string,
  ): Promise<PlatformBusinessHour[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('business_hours')
      .select('day_of_week, open_time, close_time, is_closed')
      .eq('tenant_id', tenantId)
      .order('day_of_week', { ascending: true });

    if (error) {
      this.logger.warn(`business hours lookup failed: ${error.message}`);
      return [];
    }

    return (data ?? []).map((row) => ({
      dayOfWeek: Number(row.day_of_week),
      openTime: String(row.open_time ?? ''),
      closeTime: String(row.close_time ?? ''),
      isClosed: Boolean(row.is_closed),
    }));
  }

  private async loadNameMap(
    table: 'professionals' | 'services',
    ids: string[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (ids.length === 0) {
      return map;
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from(table)
      .select('id, name')
      .in('id', ids);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    for (const row of data ?? []) {
      map.set(row.id as string, row.name as string);
    }

    return map;
  }

  private async updateTenantFields(
    tenantId: string,
    fields: Record<string, string | null>,
  ): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', tenantId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  private async cancelStripeSubscription(
    subscriptionId: string | null,
  ): Promise<void> {
    if (!subscriptionId?.trim() || !this.stripe) {
      return;
    }

    try {
      await this.stripe.subscriptions.cancel(subscriptionId);
    } catch (error) {
      this.logger.warn(
        `Failed to cancel Stripe subscription ${subscriptionId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  private async assertNoLinkedAppointments(
    tenantId: string,
    column: 'service_id' | 'professional_id',
    id: string,
  ): Promise<void> {
    const { count, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq(column, id);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if ((count ?? 0) > 0) {
      throw new ConflictException(
        'Há agendamentos vinculados. Apague os agendamentos antes.',
      );
    }
  }

  private async deleteOwnedRow(
    table: string,
    tenantId: string,
    id: string,
  ): Promise<void> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from(table)
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Registro não encontrado.');
    }
  }

  private async deleteByTenantId(table: string, tenantId: string): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from(table)
      .delete()
      .eq('tenant_id', tenantId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }
}
