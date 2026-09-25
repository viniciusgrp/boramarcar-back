import { ConfigService } from '@nestjs/config';
import type { SupabaseService } from '../supabase/supabase.service';
import type { Tenant } from '../tenants/entities/tenant.entity';
import { PlatformService } from './platform.service';

function buildTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 't-1',
    name: 'Barbearia Teste',
    slug: 'barbearia-teste',
    description: null,
    logo_url: null,
    banner_url: null,
    banner_overlay_color: '#000000',
    banner_overlay_opacity: 0.4,
    address_cep: null,
    address_street: null,
    address_number: null,
    address_complement: null,
    address_neighborhood: null,
    address_city: null,
    address_state: null,
    primary_color: '#000000',
    background_pattern_id: 'barbershop',
    background_pattern_color: '#64748b',
    background_pattern_icon_count: 22,
    admin_secondary_color_light: '#000000',
    admin_secondary_color_dark: '#ffffff',
    contact_phone: '11999990000',
    deposit_feature_enabled: false,
    support_ai_enabled: false,
    support_ai_stripe_subscription_item_id: null,
    support_ai_status: null,
    deposit_application_fee_percent: null,
    require_customer_email_confirmation: false,
    require_customer_account: false,
    allow_customer_self_cancellation: true,
    allow_customer_reschedule: true,
    booking_acceptance_type: 'AUTOMATIC',
    booking_slot_interval_minutes: 30,
    owner_id: 'owner-1',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    stripe_connect_account_id: null,
    stripe_connect_charges_enabled: false,
    stripe_connect_details_submitted: false,
    subscription_status: 'ACTIVE',
    subscription_expires_at: null,
    trial_starts_at: null,
    trial_ends_at: null,
    pre_subscription_trial_ends_at: null,
    comp_until: null,
    plan_tier: 'PRO',
    calendar_card_preferences: {} as Tenant['calendar_card_preferences'],
    enable_payout_control: false,
    payout_frequency: 'WEEKLY',
    enable_referral_program: false,
    referrer_points_bonus: 0,
    referee_points_bonus: 0,
    reviews_enabled: false,
    reviews_auto_publish: false,
    initial_setup_completed_at: null,
    initial_setup_version: null,
    initial_setup_settings_visited_at: null,
    initial_setup_customer_account_decided_at: null,
    initial_setup_booking_link_shared_at: null,
    initial_setup_hours_reviewed_at: null,
    initial_setup_first_appointment_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('PlatformService', () => {
  it('lists tenants with owner email and filters by status', async () => {
    const tenants = [
      buildTenant({
        id: 't-active',
        name: 'Ativo',
        subscription_status: 'ACTIVE',
        plan_tier: 'PRO',
      }),
      buildTenant({
        id: 't-trial',
        name: 'Trial Shop',
        subscription_status: 'INACTIVE',
        trial_ends_at: '2026-12-01T00:00:00.000Z',
        plan_tier: 'SOLO',
        owner_id: 'owner-2',
        created_at: '2026-07-01T00:00:00.000Z',
      }),
    ];

    const fromMock = jest.fn((table: string) => {
      if (table === 'tenants') {
        return {
          select: () => ({
            order: () =>
              Promise.resolve({ data: tenants, error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const getUserById = jest.fn(async (id: string) => ({
      data: {
        user: {
          id,
          email: id === 'owner-1' ? 'ativo@email.com' : 'trial@email.com',
        },
      },
      error: null,
    }));

    const supabaseService = {
      getClient: () => ({
        from: fromMock,
        auth: { admin: { getUserById } },
      }),
    } as unknown as SupabaseService;

    const configService = {
      get: () => undefined,
    } as unknown as ConfigService;

    const service = new PlatformService(supabaseService, configService);

    const all = await service.listTenants({ page: 1, pageSize: 20 });
    expect(all.total).toBe(2);
    expect(all.items[0]?.ownerEmail).toBe('ativo@email.com');

    const onlyTrial = await service.listTenants({
      page: 1,
      pageSize: 20,
      status: 'trial',
    });
    expect(onlyTrial.total).toBe(1);
    expect(onlyTrial.items[0]?.id).toBe('t-trial');
    expect(onlyTrial.items[0]?.accessLabel).toBe('trial');
  });

  it('builds summary counts by access and plan', async () => {
    const tenants = [
      buildTenant({
        id: 'a',
        subscription_status: 'ACTIVE',
        plan_tier: 'ELITE',
        created_at: '2026-08-05T00:00:00.000Z',
      }),
      buildTenant({
        id: 'b',
        subscription_status: 'PAST_DUE',
        plan_tier: 'PRO',
        created_at: '2026-07-05T00:00:00.000Z',
      }),
      buildTenant({
        id: 'c',
        subscription_status: 'INACTIVE',
        trial_ends_at: '2026-12-20T00:00:00.000Z',
        plan_tier: 'SOLO',
        created_at: '2026-06-05T00:00:00.000Z',
      }),
    ];

    const supabaseService = {
      getClient: () => ({
        from: () => ({
          select: () => ({
            order: () => Promise.resolve({ data: tenants, error: null }),
          }),
        }),
      }),
    } as unknown as SupabaseService;

    const configService = {
      get: () => undefined,
    } as unknown as ConfigService;

    const service = new PlatformService(supabaseService, configService);
    const summary = await service.getSummary();

    expect(summary.totalTenants).toBe(3);
    expect(summary.byAccess.active).toBe(1);
    expect(summary.byAccess.pastDue).toBe(1);
    expect(summary.byAccess.trial).toBe(1);
    expect(summary.byPlan.ELITE).toBe(1);
    expect(summary.byPlan.PRO).toBe(1);
    expect(summary.byPlan.SOLO).toBe(1);
    expect(summary.growthByMonth).toHaveLength(12);
  });

  it('grants a complimentary plan until a future date', async () => {
    const tenant = buildTenant({
      subscription_status: 'ACTIVE',
      stripe_subscription_id: null,
    });
    const updates: Record<string, unknown>[] = [];

    const supabaseService = {
      getClient: () => ({
        from: () => {
          const query: Record<string, unknown> = {};
          const chain = () => query;
          query.select = chain;
          query.eq = chain;
          query.update = (payload: Record<string, unknown>) => {
            updates.push(payload);
            Object.assign(tenant, payload);
            return query;
          };
          query.maybeSingle = async () => ({ data: tenant, error: null });
          return query;
        },
      }),
    } as unknown as SupabaseService;

    const service = new PlatformService(
      supabaseService,
      { get: () => undefined } as unknown as ConfigService,
    );
    jest
      .spyOn(service, 'getTenantDetail')
      .mockResolvedValue({ id: tenant.id } as never);

    await service.grantPlan('t-1', 'ELITE', '2027-01-15T23:59:59.000Z');

    expect(updates[0]).toEqual(
      expect.objectContaining({
        plan_tier: 'ELITE',
        subscription_status: 'INACTIVE',
        trial_ends_at: '2027-01-15T23:59:59.000Z',
        comp_until: '2027-01-15T23:59:59.000Z',
      }),
    );
  });

  it('extends trial and complimentary end together', async () => {
    const tenant = buildTenant({
      subscription_status: 'INACTIVE',
      trial_ends_at: '2026-10-01T00:00:00.000Z',
      comp_until: '2026-10-01T00:00:00.000Z',
    });
    const updates: Record<string, unknown>[] = [];

    const supabaseService = {
      getClient: () => ({
        from: () => {
          const query: Record<string, unknown> = {};
          const chain = () => query;
          query.select = chain;
          query.eq = chain;
          query.update = (payload: Record<string, unknown>) => {
            updates.push(payload);
            Object.assign(tenant, payload);
            return query;
          };
          query.maybeSingle = async () => ({ data: tenant, error: null });
          return query;
        },
      }),
    } as unknown as SupabaseService;

    const service = new PlatformService(
      supabaseService,
      { get: () => undefined } as unknown as ConfigService,
    );
    jest
      .spyOn(service, 'getTenantDetail')
      .mockResolvedValue({ id: tenant.id } as never);

    await service.extendTrial('t-1', 10);

    expect(updates[0]?.trial_ends_at).toBe('2026-10-11T00:00:00.000Z');
    expect(updates[0]?.comp_until).toBe('2026-10-11T00:00:00.000Z');
  });

  it('cancels a local plan without Stripe', async () => {
    const tenant = buildTenant({
      subscription_status: 'INACTIVE',
      trial_ends_at: '2026-10-01T00:00:00.000Z',
      comp_until: '2026-10-01T00:00:00.000Z',
      plan_tier: 'ELITE',
    });
    const updates: Record<string, unknown>[] = [];

    const supabaseService = {
      getClient: () => ({
        from: () => {
          const query: Record<string, unknown> = {};
          const chain = () => query;
          query.select = chain;
          query.eq = chain;
          query.update = (payload: Record<string, unknown>) => {
            updates.push(payload);
            Object.assign(tenant, payload);
            return query;
          };
          query.maybeSingle = async () => ({ data: tenant, error: null });
          return query;
        },
      }),
    } as unknown as SupabaseService;

    const service = new PlatformService(
      supabaseService,
      { get: () => undefined } as unknown as ConfigService,
    );
    jest
      .spyOn(service, 'getTenantDetail')
      .mockResolvedValue({ id: tenant.id } as never);

    await service.cancelPlan('t-1');

    expect(updates.at(-1)).toEqual(
      expect.objectContaining({
        subscription_status: 'CANCELED',
        plan_tier: 'SOLO',
        trial_ends_at: null,
        stripe_subscription_id: null,
        comp_until: null,
      }),
    );
  });

  it('deletes blocking rows before the tenant', async () => {
    const tenant = buildTenant();
    const deleted: string[] = [];
    const deleteUser = jest.fn().mockResolvedValue({ error: null });

    const supabaseService = {
      getClient: () => ({
        from: (table: string) => {
          const query: Record<string, unknown> & {
            _count?: boolean;
            _cols?: string;
          } = {};
          const chain = () => query;
          query.select = (cols?: string, opts?: { count?: string }) => {
            query._cols = cols;
            query._count = Boolean(opts?.count);
            return query;
          };
          query.eq = chain;
          query.delete = () => {
            deleted.push(table);
            return query;
          };
          query.maybeSingle = async () => ({ data: tenant, error: null });
          query.then = (
            resolve: (value: {
              data: unknown;
              error: null;
              count?: number;
            }) => unknown,
          ) => {
            if (query._count) {
              return Promise.resolve({
                data: null,
                error: null,
                count: 0,
              }).then(resolve);
            }
            if (table === 'tenant_users' && query._cols === 'user_id') {
              return Promise.resolve({
                data: [{ user_id: 'user-1' }],
                error: null,
              }).then(resolve);
            }
            if (table === 'customers' && query._cols === 'auth_user_id') {
              return Promise.resolve({
                data: [{ auth_user_id: 'cust-1' }],
                error: null,
              }).then(resolve);
            }
            return Promise.resolve({ data: null, error: null }).then(resolve);
          };
          return query;
        },
        auth: {
          admin: {
            deleteUser,
          },
        },
      }),
    } as unknown as SupabaseService;

    const service = new PlatformService(
      supabaseService,
      { get: () => undefined } as unknown as ConfigService,
    );

    await service.deleteTenant('t-1', 'Barbearia Teste');

    expect(deleted).toEqual([
      'appointments',
      'product_sale_items',
      'service_products',
      'affiliate_commission_items',
      'tenants',
    ]);
    expect(deleteUser).toHaveBeenCalledWith('user-1');
    expect(deleteUser).toHaveBeenCalledWith('cust-1');
  });

  it('does not delete auth users still linked to another tenant', async () => {
    const tenant = buildTenant();
    const deleteUser = jest.fn().mockResolvedValue({ error: null });

    const supabaseService = {
      getClient: () => ({
        from: (table: string) => {
          const query: Record<string, unknown> & {
            _count?: boolean;
            _cols?: string;
          } = {};
          const chain = () => query;
          query.select = (cols?: string, opts?: { count?: string }) => {
            query._cols = cols;
            query._count = Boolean(opts?.count);
            return query;
          };
          query.eq = chain;
          query.delete = () => query;
          query.maybeSingle = async () => ({ data: tenant, error: null });
          query.then = (
            resolve: (value: {
              data: unknown;
              error: null;
              count?: number;
            }) => unknown,
          ) => {
            if (query._count) {
              return Promise.resolve({
                data: null,
                error: null,
                count: table === 'tenant_users' ? 1 : 0,
              }).then(resolve);
            }
            if (table === 'tenant_users' && query._cols === 'user_id') {
              return Promise.resolve({
                data: [{ user_id: 'user-1' }],
                error: null,
              }).then(resolve);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve);
          };
          return query;
        },
        auth: { admin: { deleteUser } },
      }),
    } as unknown as SupabaseService;

    const service = new PlatformService(
      supabaseService,
      { get: () => undefined } as unknown as ConfigService,
    );

    await service.deleteTenant('t-1', 'Barbearia Teste');

    expect(deleteUser).not.toHaveBeenCalled();
  });
});
