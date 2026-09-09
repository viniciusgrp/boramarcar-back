import { NotFoundException } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { toPublicTenant } from './utils/to-public-tenant.util';
import type { Tenant } from './entities/tenant.entity';

describe('TenantsController', () => {
  const tenant = {
    id: 'tenant-1',
    name: 'Studio',
    slug: 'studio',
    subscription_status: 'ACTIVE',
    trial_ends_at: null,
    stripe_customer_id: 'cus_secret',
    owner_id: 'owner-secret',
    enable_referral_program: false,
    referrer_points_bonus: 0,
    referee_points_bonus: 0,
    reviews_enabled: false,
    deposit_feature_enabled: false,
    require_customer_email_confirmation: false,
    require_customer_account: false,
    allow_customer_self_cancellation: false,
    allow_customer_reschedule: false,
    booking_acceptance_type: 'AUTOMATIC',
    booking_slot_interval_minutes: 15,
    description: null,
    logo_url: null,
    banner_url: null,
    banner_overlay_color: '#000000',
    banner_overlay_opacity: 0,
    address_cep: null,
    address_street: null,
    address_number: null,
    address_complement: null,
    address_neighborhood: null,
    address_city: null,
    address_state: null,
    primary_color: '#111827',
    background_pattern_id: 'barbershop',
    background_pattern_color: '#64748b',
    background_pattern_icon_count: 22,
    contact_phone: null,
  } as Tenant;

  it('returns the public tenant DTO without Stripe ids', async () => {
    const controller = new TenantsController(
      { findBySlug: jest.fn().mockResolvedValue(tenant) } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const publicTenant = await controller.findBySlug('studio');
    expect(publicTenant).toEqual(toPublicTenant(tenant));
    expect(publicTenant).not.toHaveProperty('stripe_customer_id');
    expect(publicTenant).not.toHaveProperty('owner_id');
  });

  it('throws when the slug is unknown', async () => {
    const controller = new TenantsController(
      { findBySlug: jest.fn().mockResolvedValue(null) } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(controller.findBySlug('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
