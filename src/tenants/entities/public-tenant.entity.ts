import type { TenantBookingAcceptanceType } from '../../booking/entities/booking-acceptance-type.type';

/**
 * Safe subset of Tenant exposed on public booking routes (GET /tenants/:slug).
 * Omits Stripe IDs, owner, payout prefs, plan/subscription commercial details,
 * and internal onboarding fields. Use accepts_public_bookings instead of plan/trial.
 */
export interface PublicTenant {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  banner_overlay_color: string;
  banner_overlay_opacity: number;
  address_cep: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  primary_color: string;
  contact_phone: string | null;
  deposit_feature_enabled: boolean;
  require_customer_email_confirmation: boolean;
  require_customer_account: boolean;
  allow_customer_self_cancellation: boolean;
  allow_customer_reschedule: boolean;
  booking_acceptance_type: TenantBookingAcceptanceType;
  booking_slot_interval_minutes: number;
  /** Server-computed: active subscription or trial (no plan/trial leak). */
  accepts_public_bookings: boolean;
  enable_referral_program: boolean;
  referrer_points_bonus: number;
  referee_points_bonus: number;
  reviews_enabled: boolean;
}
