import { DEFAULT_CALENDAR_CARD_PREFERENCES } from '../entities/calendar-card-preferences.type';
import type { Tenant } from '../entities/tenant.entity';
import { toPublicTenant } from './to-public-tenant.util';

function buildTenant(): Tenant {
  return {
    id: 'tenant-1',
    name: 'Barbearia do Zé',
    slug: 'barbearia-do-ze',
    description: 'Cortes e barba no centro de SP.',
    logo_url: 'https://cdn/logo.png',
    banner_url: 'https://cdn/banner.png',
    banner_overlay_color: '#000000',
    banner_overlay_opacity: 0.4,
    address_cep: '01000-000',
    address_street: 'Rua A',
    address_number: '100',
    address_complement: null,
    address_neighborhood: 'Centro',
    address_city: 'São Paulo',
    address_state: 'SP',
    primary_color: '#111827',
    background_pattern_id: 'barbershop',
    background_pattern_color: '#64748b',
    background_pattern_icon_count: 22,
    admin_secondary_color_light: '#b45309',
    admin_secondary_color_dark: '#f59e0b',
    contact_phone: '5511999999999',
    deposit_feature_enabled: true,
    deposit_application_fee_percent: 5,
    require_customer_email_confirmation: false,
    require_customer_account: true,
    allow_customer_self_cancellation: false,
    allow_customer_reschedule: false,
    booking_acceptance_type: 'AUTOMATIC',
    booking_slot_interval_minutes: 15,
    owner_id: 'owner-secret',
    stripe_customer_id: 'cus_secret',
    stripe_subscription_id: 'sub_secret',
    stripe_connect_account_id: 'acct_secret',
    stripe_connect_charges_enabled: true,
    stripe_connect_details_submitted: true,
    subscription_status: 'ACTIVE',
    subscription_expires_at: '2026-12-31T00:00:00.000Z',
    trial_starts_at: '2026-01-01T00:00:00.000Z',
    trial_ends_at: '2026-01-14T00:00:00.000Z',
    pre_subscription_trial_ends_at: null,
    plan_tier: 'PRO',
    calendar_card_preferences: { ...DEFAULT_CALENDAR_CARD_PREFERENCES },
    enable_payout_control: true,
    payout_frequency: 'WEEKLY',
    enable_referral_program: true,
    referrer_points_bonus: 10,
    referee_points_bonus: 5,
    reviews_enabled: true,
    reviews_auto_publish: false,
    initial_setup_completed_at: null,
    initial_setup_version: 5,
    initial_setup_settings_visited_at: null,
    initial_setup_customer_account_decided_at: null,
    initial_setup_booking_link_shared_at: null,
    support_ai_enabled: false,
    support_ai_stripe_subscription_item_id: null,
    support_ai_status: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
  };
}

describe('toPublicTenant', () => {
  it('strips every sensitive field from the public payload', () => {
    const publicTenant = toPublicTenant(buildTenant()) as unknown as Record<
      string,
      unknown
    >;

    const sensitiveKeys = [
      'owner_id',
      'stripe_customer_id',
      'stripe_subscription_id',
      'stripe_connect_account_id',
      'stripe_connect_charges_enabled',
      'stripe_connect_details_submitted',
      'subscription_status',
      'subscription_expires_at',
      'trial_starts_at',
      'trial_ends_at',
      'pre_subscription_trial_ends_at',
      'plan_tier',
      'deposit_application_fee_percent',
      'calendar_card_preferences',
      'enable_payout_control',
      'payout_frequency',
      'admin_secondary_color_light',
      'admin_secondary_color_dark',
      'initial_setup_completed_at',
      'initial_setup_version',
      'initial_setup_settings_visited_at',
      'initial_setup_customer_account_decided_at',
      'initial_setup_booking_link_shared_at',
      'created_at',
      'updated_at',
    ];

    for (const key of sensitiveKeys) {
      expect(publicTenant).not.toHaveProperty(key);
    }
  });

  it('keeps the fields the public booking page needs', () => {
    const tenant = buildTenant();
    const publicTenant = toPublicTenant(tenant);

    expect(publicTenant).toMatchObject({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      description: tenant.description,
      primary_color: tenant.primary_color,
      background_pattern_id: tenant.background_pattern_id,
      background_pattern_color: tenant.background_pattern_color,
      background_pattern_icon_count: tenant.background_pattern_icon_count,
      contact_phone: tenant.contact_phone,
      accepts_public_bookings: true,
      booking_acceptance_type: tenant.booking_acceptance_type,
      enable_referral_program: tenant.enable_referral_program,
      reviews_enabled: tenant.reviews_enabled,
      allow_customer_reschedule: tenant.allow_customer_reschedule,
    });
  });
});
