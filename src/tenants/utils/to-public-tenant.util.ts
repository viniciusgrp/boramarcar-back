import type { PublicTenant } from '../entities/public-tenant.entity';
import type { Tenant } from '../entities/tenant.entity';

export function toPublicTenant(tenant: Tenant): PublicTenant {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    description: tenant.description,
    logo_url: tenant.logo_url,
    banner_url: tenant.banner_url,
    banner_overlay_color: tenant.banner_overlay_color,
    banner_overlay_opacity: tenant.banner_overlay_opacity,
    address_cep: tenant.address_cep,
    address_street: tenant.address_street,
    address_number: tenant.address_number,
    address_complement: tenant.address_complement,
    address_neighborhood: tenant.address_neighborhood,
    address_city: tenant.address_city,
    address_state: tenant.address_state,
    primary_color: tenant.primary_color,
    contact_phone: tenant.contact_phone,
    deposit_feature_enabled: tenant.deposit_feature_enabled,
    require_customer_email_confirmation:
      tenant.require_customer_email_confirmation,
    require_customer_account: tenant.require_customer_account,
    allow_customer_self_cancellation: tenant.allow_customer_self_cancellation,
    booking_acceptance_type: tenant.booking_acceptance_type,
    booking_slot_interval_minutes: tenant.booking_slot_interval_minutes,
    subscription_status: tenant.subscription_status,
    trial_ends_at: tenant.trial_ends_at,
    plan_tier: tenant.plan_tier,
    enable_referral_program: tenant.enable_referral_program,
    referrer_points_bonus: tenant.referrer_points_bonus,
    referee_points_bonus: tenant.referee_points_bonus,
  };
}
