import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { OnboardTenantDto } from './dto/onboard-tenant.dto';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { SlugAvailabilityResponseDto } from './dto/slug-availability.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import type { TenantBookingAcceptanceType } from '../booking/entities/booking-acceptance-type.type';
import {
  assertBookingSlotIntervalMinutes,
  normalizeBookingSlotIntervalMinutes,
} from '../booking/utils/booking-slot-interval.util';
import type { PlanTier } from './entities/plan-tier.type';
import type { SupportAiStatus } from './entities/support-ai-status.type';
import { normalizeSupportAiStatus } from './entities/support-ai-status.type';
import type { SubscriptionStatus } from './entities/subscription-status.type';
import { Tenant } from './entities/tenant.entity';
import {
  isStoredSlug,
  isValidSlug,
  normalizeSlug,
  resolveSlugForUpdate,
} from './utils/slug.util';
import { normalizeFirstVisitAt } from './utils/normalize-first-visit-at.util';
import { normalizePlanTier } from './utils/plan-tier.util';
import {
  buildTrialPeriod,
  TRIAL_DEFAULT_PLAN_TIER,
} from './utils/trial-period.util';
import { normalizeCalendarCardPreferences } from './utils/calendar-card-preferences.util';
import {
  canCustomizeAdminThemeColors,
  DEFAULT_ADMIN_SECONDARY_COLOR_DARK,
  DEFAULT_ADMIN_SECONDARY_COLOR_LIGHT,
  normalizeAdminThemeColor,
} from './utils/admin-theme.util';
import { UpdateTenantAdminThemeDto } from './dto/update-tenant-admin-theme.dto';
import { normalizePayoutFrequency } from './entities/payout-frequency.type';
import {
  normalizeBackgroundPatternColor,
  normalizeBackgroundPatternIconCount,
  normalizeBackgroundPatternId,
} from './utils/background-pattern.util';
import { NtfyService } from '../notifications/ntfy.service';
import { AffiliatesService } from '../affiliates/affiliates.service';
import { EmailFunnelService } from '../email-funnel/email-funnel.service';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { isProductionAppEnv } from '../common/app-env.util';
import { isDisposableEmail } from '../security/disposable-email.util';
import { MetaCapiService } from '../tracking/meta-capi.service';
import type { Request } from 'express';
import { getClientIp } from '../security/client-ip.util';
import {
  ESTABLISHMENT_EMAIL_ALREADY_CONFIRMED_MESSAGE,
  ESTABLISHMENT_EMAIL_IN_USE_MESSAGE,
  ESTABLISHMENT_EMAIL_NOT_CONFIRMED_MESSAGE,
  ESTABLISHMENT_OTP_INVALID_MESSAGE,
  ESTABLISHMENT_OTP_LOCKED_MESSAGE,
  ESTABLISHMENT_VERIFICATION_SEND_FAILED_MESSAGE,
  DISPOSABLE_EMAIL_MESSAGE,
} from '../security/signup-security.messages';
import {
  REQUIRES_EMAIL_VERIFICATION_METADATA_KEY,
  buildEstablishmentVerificationCallbackUrl,
  isSixDigitOtp,
  normalizeEstablishmentOtpCode,
  requiresEstablishmentEmailVerification,
} from '../security/establishment-email-verification.util';
import {
  ESTABLISHMENT_OTP_ATTEMPTS_KEY,
  ESTABLISHMENT_OTP_EXPIRES_AT_KEY,
  ESTABLISHMENT_OTP_HASH_KEY,
  ESTABLISHMENT_OTP_MAX_ATTEMPTS,
  ESTABLISHMENT_OTP_TTL_MS,
  generateEstablishmentOtp,
  hashEstablishmentOtp,
  isEstablishmentOtpExpired,
  readEstablishmentOtpAttempts,
} from '../security/establishment-otp.util';
import { TenantUsersService } from './tenant-users.service';
import { toSafeTenantForRole } from './utils/to-safe-tenant.util';
import type { TenantAccessContext } from './entities/tenant-access-context.entity';
import type { TenantMeResponse } from './entities/tenant-me-response.entity';
import type { TenantUser } from './entities/tenant-user.entity';
import { canAccessPanelWithLinkedProfessional } from './utils/inactive-professional-access.util';
import { tenantCanChargeDeposits } from './utils/deposit-charges.util';
import { PLAN_TIERS } from './entities/plan-tier.type';

export interface TenantSubscriptionUpdatePayload {
  asaasCustomerId?: string | null;
  asaasSubscriptionId?: string | null;
  asaasPendingPaymentId?: string | null;
  asaasOpenInvoiceUrl?: string | null;
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiresAt?: string | null;
  subscriptionCancelAt?: string | null;
  planTier?: PlanTier;
  pendingPlanTier?: PlanTier | null;
  pendingPlanPaymentId?: string | null;
  pendingPlanInvoiceUrl?: string | null;
  pendingPlanEffectiveAt?: string | null;
  trialEndsAt?: string | null;
  preSubscriptionTrialEndsAt?: string | null;
  compUntil?: string | null;
}

export interface RegisterTenantResult {
  tenant: Tenant;
  requiresEmailConfirmation: boolean;
  email?: string;
  otpType?: string;
}

interface TenantTrackingData {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  fbclid?: string | null;
  firstVisitAt?: string | null;
}

interface MetaTrackingData {
  eventId?: string;
  fbp?: string;
  fbc?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
}

function applySubscriptionTrialFields(
  updatePayload: Record<string, string | null>,
  payload: Pick<
    TenantSubscriptionUpdatePayload,
    'trialEndsAt' | 'preSubscriptionTrialEndsAt' | 'compUntil'
  >,
): void {
  if (payload.trialEndsAt !== undefined) {
    updatePayload.trial_ends_at = payload.trialEndsAt;
  }

  if (payload.preSubscriptionTrialEndsAt !== undefined) {
    updatePayload.pre_subscription_trial_ends_at =
      payload.preSubscriptionTrialEndsAt;
  }

  if (payload.compUntil !== undefined) {
    updatePayload.comp_until = payload.compUntil;
  }
}

function mapTenantRow(row: Tenant): Tenant {
  const subscriptionStatus = row.subscription_status;
  const source = {
    ...(row as Tenant & { asaas_subaccount_api_key_encrypted?: string | null }),
  };
  delete source.asaas_subaccount_api_key_encrypted;
  delete (source as { deposit_charge_alerted_on?: string | null })
    .deposit_charge_alerted_on;

  return {
    ...source,
    description:
      typeof row.description === 'string' && row.description.trim()
        ? row.description.trim()
        : null,
    pre_subscription_trial_ends_at: row.pre_subscription_trial_ends_at ?? null,
    comp_until: row.comp_until ?? null,
    banner_overlay_color: normalizeOverlayColor(row.banner_overlay_color),
    banner_overlay_opacity: normalizeOverlayOpacity(row.banner_overlay_opacity),
    subscription_status:
      subscriptionStatus === 'ACTIVE' ||
      subscriptionStatus === 'INACTIVE' ||
      subscriptionStatus === 'PAST_DUE' ||
      subscriptionStatus === 'CANCELED'
        ? subscriptionStatus
        : 'INACTIVE',
    plan_tier: normalizePlanTier(row.plan_tier),
    booking_acceptance_type: normalizeTenantBookingAcceptanceType(
      row.booking_acceptance_type,
    ),
    calendar_card_preferences: normalizeCalendarCardPreferences(
      row.calendar_card_preferences,
    ),
    enable_payout_control: Boolean(row.enable_payout_control),
    payout_frequency: normalizePayoutFrequency(row.payout_frequency),
    enable_referral_program: Boolean(row.enable_referral_program),
    referrer_points_bonus: Number(row.referrer_points_bonus ?? 0),
    referee_points_bonus: Number(row.referee_points_bonus ?? 0),
    reviews_enabled: Boolean(row.reviews_enabled),
    reviews_auto_publish: Boolean(row.reviews_auto_publish),
    require_customer_email_confirmation: Boolean(
      row.require_customer_email_confirmation,
    ),
    require_customer_account:
      row.require_customer_account === undefined ||
      row.require_customer_account === null
        ? true
        : Boolean(row.require_customer_account),
    allow_customer_self_cancellation: Boolean(
      row.allow_customer_self_cancellation,
    ),
    allow_customer_reschedule: Boolean(row.allow_customer_reschedule),
    deposit_feature_enabled: Boolean(row.deposit_feature_enabled),
    support_ai_enabled: Boolean(row.support_ai_enabled),
    support_ai_asaas_subscription_id:
      typeof row.support_ai_asaas_subscription_id === 'string'
        ? row.support_ai_asaas_subscription_id
        : null,
    support_ai_status: normalizeSupportAiStatus(row.support_ai_status),
    deposit_application_fee_percent:
      row.deposit_application_fee_percent === null ||
      row.deposit_application_fee_percent === undefined
        ? null
        : Number(row.deposit_application_fee_percent),
    booking_slot_interval_minutes: normalizeBookingSlotIntervalMinutes(
      row.booking_slot_interval_minutes,
    ),
    asaas_charges_enabled: Boolean(row.asaas_charges_enabled),
    asaas_details_submitted: Boolean(row.asaas_details_submitted),
    subscription_cancel_at: row.subscription_cancel_at ?? null,
    pending_plan_tier: readPendingPlanTier(row.pending_plan_tier),
    pending_plan_payment_id: row.pending_plan_payment_id ?? null,
    pending_plan_invoice_url: row.pending_plan_invoice_url ?? null,
    pending_plan_effective_at: row.pending_plan_effective_at ?? null,
    can_charge_deposits: tenantCanChargeDeposits(row),
    admin_secondary_color_light: normalizeAdminThemeColor(
      row.admin_secondary_color_light,
      DEFAULT_ADMIN_SECONDARY_COLOR_LIGHT,
    ),
    admin_secondary_color_dark: normalizeAdminThemeColor(
      row.admin_secondary_color_dark,
      DEFAULT_ADMIN_SECONDARY_COLOR_DARK,
    ),
    background_pattern_id: normalizeBackgroundPatternId(
      row.background_pattern_id,
    ),
    background_pattern_color: normalizeBackgroundPatternColor(
      row.background_pattern_color,
    ),
    background_pattern_icon_count: normalizeBackgroundPatternIconCount(
      row.background_pattern_icon_count,
    ),
  };
}

function readPendingPlanTier(
  value: string | null | undefined,
): PlanTier | null {
  if (value && PLAN_TIERS.includes(value as PlanTier)) {
    return value as PlanTier;
  }

  return null;
}

function normalizeTenantBookingAcceptanceType(
  value: TenantBookingAcceptanceType | null | undefined,
): TenantBookingAcceptanceType {
  return value === 'MANUAL' ? 'MANUAL' : 'AUTOMATIC';
}

const DEFAULT_BANNER_OVERLAY_COLOR = '#000000';

function normalizeOverlayColor(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    return DEFAULT_BANNER_OVERLAY_COLOR;
  }

  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed)
    ? trimmed.toLowerCase()
    : DEFAULT_BANNER_OVERLAY_COLOR;
}

function normalizeOverlayOpacity(value: number | null | undefined): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(1, Math.max(0, Math.round(parsed * 100) / 100));
}

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly tenantUsersService: TenantUsersService,
    private readonly ntfyService: NtfyService,
    private readonly affiliatesService: AffiliatesService,
    private readonly emailFunnelService: EmailFunnelService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly metaCapiService: MetaCapiService,
  ) {}

  async findById(tenantId: string): Promise<Tenant | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ? mapTenantRow(data as Tenant) : null;
  }

  async findAccessContextByUserId(
    userId: string,
  ): Promise<TenantAccessContext | null> {
    const tenantUser = await this.tenantUsersService.findByUserId(userId);

    if (tenantUser) {
      const tenant = await this.findById(tenantUser.tenant_id);

      if (!tenant) {
        return null;
      }

      const linkedProfessionalIsArchived =
        await this.tenantUsersService.findLinkedProfessionalArchivedStatus(
          tenantUser.tenant_id,
          tenantUser.professional_id,
        );

      if (
        !canAccessPanelWithLinkedProfessional(
          tenantUser.role,
          linkedProfessionalIsArchived,
        )
      ) {
        throw new ForbiddenException(
          'Seu acesso ao painel foi revogado porque o perfil profissional foi excluído.',
        );
      }

      return {
        tenant,
        tenantUser,
      };
    }

    const legacyTenant = await this.findByOwnerId(userId);

    if (!legacyTenant) {
      return null;
    }

    return {
      tenant: legacyTenant,
      tenantUser: this.buildLegacyOwnerMembership(legacyTenant, userId),
    };
  }

  async findMeResponse(userId: string): Promise<TenantMeResponse | null> {
    const accessContext = await this.findAccessContextByUserId(userId);

    if (!accessContext) {
      return null;
    }

    return {
      tenant: toSafeTenantForRole(
        accessContext.tenant,
        accessContext.tenantUser.role,
      ),
      membership: this.tenantUsersService.mapMembershipSummary(
        accessContext.tenantUser,
      ),
    };
  }

  private buildLegacyOwnerMembership(
    tenant: Tenant,
    userId: string,
  ): TenantUser {
    return {
      id: `legacy-owner-${tenant.id}`,
      tenant_id: tenant.id,
      user_id: userId,
      role: 'OWNER',
      professional_id: null,
      preferences: { admin_theme_mode: 'light' },
      created_at: tenant.created_at,
      updated_at: tenant.updated_at,
    };
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ? mapTenantRow(data as Tenant) : null;
  }

  async findByOwnerId(ownerId: string): Promise<Tenant | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select('*')
      .eq('owner_id', ownerId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ? mapTenantRow(data as Tenant) : null;
  }

  async updateForOwner(ownerId: string, dto: UpdateTenantDto): Promise<Tenant> {
    const accessContext = await this.findAccessContextByUserId(ownerId);

    if (!accessContext) {
      throw new NotFoundException(
        'No establishment linked to the authenticated user',
      );
    }

    const tenant = accessContext.tenant;

    const slugToSave = resolveSlugForUpdate(tenant.slug, dto.slug);
    const slugWasEdited = slugToSave !== tenant.slug;

    const slugIsValid = slugWasEdited
      ? isValidSlug(slugToSave)
      : isStoredSlug(slugToSave);

    if (!slugIsValid) {
      throw new BadRequestException(
        'A URL personalizada deve conter apenas letras minúsculas, números e traços.',
      );
    }

    const slugTaken = await this.isSlugTakenByAnotherTenant(
      slugToSave,
      tenant.id,
    );

    if (slugTaken) {
      throw new ConflictException(
        'Esta URL já está em uso por outro estabelecimento.',
      );
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .update({
        name: dto.name.trim(),
        slug: slugToSave,
        description:
          dto.description !== undefined
            ? this.normalizeOptionalText(dto.description)
            : tenant.description,
        primary_color: dto.primaryColor.trim(),
        background_pattern_id: normalizeBackgroundPatternId(
          dto.backgroundPatternId ?? tenant.background_pattern_id,
        ),
        background_pattern_color: normalizeBackgroundPatternColor(
          dto.backgroundPatternColor ?? tenant.background_pattern_color,
        ),
        background_pattern_icon_count: normalizeBackgroundPatternIconCount(
          dto.backgroundPatternIconCount ??
            tenant.background_pattern_icon_count,
        ),
        contact_phone: this.normalizeContactPhone(dto.contactPhone),
        logo_url: this.normalizeOptionalText(dto.logoUrl),
        banner_url: this.normalizeOptionalText(dto.bannerUrl),
        banner_overlay_color:
          dto.bannerOverlayColor !== undefined
            ? normalizeOverlayColor(dto.bannerOverlayColor)
            : tenant.banner_overlay_color,
        banner_overlay_opacity:
          dto.bannerOverlayOpacity !== undefined
            ? normalizeOverlayOpacity(dto.bannerOverlayOpacity)
            : tenant.banner_overlay_opacity,
        address_cep: this.normalizeCep(dto.addressCep),
        address_street: this.normalizeOptionalText(dto.addressStreet),
        address_number: this.normalizeOptionalText(dto.addressNumber),
        address_complement: this.normalizeOptionalText(dto.addressComplement),
        address_neighborhood: this.normalizeOptionalText(
          dto.addressNeighborhood,
        ),
        address_city: this.normalizeOptionalText(dto.addressCity),
        address_state: this.normalizeState(dto.addressState),
        require_customer_email_confirmation:
          dto.requireCustomerEmailConfirmation ??
          tenant.require_customer_email_confirmation,
        require_customer_account:
          dto.requireCustomerAccount ?? tenant.require_customer_account,
        allow_customer_self_cancellation:
          dto.allowCustomerSelfCancellation ??
          tenant.allow_customer_self_cancellation,
        allow_customer_reschedule:
          dto.allowCustomerReschedule ?? tenant.allow_customer_reschedule,
        ...(dto.requireCustomerAccount !== undefined &&
        !tenant.initial_setup_customer_account_decided_at
          ? {
              initial_setup_customer_account_decided_at:
                new Date().toISOString(),
            }
          : {}),
        booking_acceptance_type: normalizeTenantBookingAcceptanceType(
          dto.bookingAcceptanceType,
        ),
        booking_slot_interval_minutes:
          dto.bookingSlotIntervalMinutes !== undefined
            ? assertBookingSlotIntervalMinutes(dto.bookingSlotIntervalMinutes)
            : tenant.booking_slot_interval_minutes,
        calendar_card_preferences: normalizeCalendarCardPreferences(
          dto.calendarCardPreferences ?? tenant.calendar_card_preferences,
        ),
        enable_payout_control:
          dto.enablePayoutControl ?? tenant.enable_payout_control,
        payout_frequency: normalizePayoutFrequency(
          dto.payoutFrequency ?? tenant.payout_frequency,
        ),
        enable_referral_program:
          dto.enableReferralProgram ?? tenant.enable_referral_program,
        referrer_points_bonus: this.resolveNonNegativeInteger(
          dto.referrerPointsBonus,
          tenant.referrer_points_bonus,
        ),
        referee_points_bonus: this.resolveNonNegativeInteger(
          dto.refereePointsBonus,
          tenant.referee_points_bonus,
        ),
        reviews_enabled: dto.reviewsEnabled ?? tenant.reviews_enabled,
        reviews_auto_publish:
          dto.reviewsAutoPublish ?? tenant.reviews_auto_publish,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenant.id)
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return mapTenantRow(data as Tenant);
  }

  async updateAdminThemeForOwner(
    ownerId: string,
    dto: UpdateTenantAdminThemeDto,
  ): Promise<Tenant> {
    const accessContext = await this.findAccessContextByUserId(ownerId);

    if (!accessContext) {
      throw new NotFoundException(
        'No establishment linked to the authenticated user',
      );
    }

    const tenant = accessContext.tenant;

    if (!canCustomizeAdminThemeColors(tenant.plan_tier)) {
      throw new ForbiddenException(
        'Personalização de cores do painel disponível nos planos Pro e Elite.',
      );
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .update({
        admin_secondary_color_light: normalizeAdminThemeColor(
          dto.secondaryColorLight,
          DEFAULT_ADMIN_SECONDARY_COLOR_LIGHT,
        ),
        admin_secondary_color_dark: normalizeAdminThemeColor(
          dto.secondaryColorDark,
          DEFAULT_ADMIN_SECONDARY_COLOR_DARK,
        ),
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenant.id)
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return mapTenantRow(data as Tenant);
  }

  private async isSlugTakenByAnotherTenant(
    slug: string,
    tenantId: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .neq('id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return Boolean(data);
  }

  async findByAsaasCustomerId(asaasCustomerId: string): Promise<Tenant | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select('*')
      .eq('asaas_customer_id', asaasCustomerId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ? mapTenantRow(data as Tenant) : null;
  }

  async findByAsaasSubscriptionId(
    asaasSubscriptionId: string,
  ): Promise<Tenant | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select('*')
      .eq('asaas_subscription_id', asaasSubscriptionId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ? mapTenantRow(data as Tenant) : null;
  }

  async findBySupportAiAsaasSubscriptionId(
    subscriptionId: string,
  ): Promise<Tenant | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select('*')
      .eq('support_ai_asaas_subscription_id', subscriptionId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ? mapTenantRow(data as Tenant) : null;
  }

  async updateSubscriptionByTenantId(
    tenantId: string,
    payload: TenantSubscriptionUpdatePayload,
  ): Promise<Tenant | null> {
    const updatePayload: Record<string, string | null> = {
      subscription_status: payload.subscriptionStatus,
      updated_at: new Date().toISOString(),
    };

    if (payload.asaasCustomerId !== undefined) {
      updatePayload.asaas_customer_id = payload.asaasCustomerId;
    }

    if (payload.asaasSubscriptionId !== undefined) {
      updatePayload.asaas_subscription_id = payload.asaasSubscriptionId;
    }

    if (payload.asaasPendingPaymentId !== undefined) {
      updatePayload.asaas_pending_payment_id = payload.asaasPendingPaymentId;
    }

    if (payload.asaasOpenInvoiceUrl !== undefined) {
      updatePayload.asaas_open_invoice_url = payload.asaasOpenInvoiceUrl;
    }

    if (payload.subscriptionExpiresAt !== undefined) {
      updatePayload.subscription_expires_at = payload.subscriptionExpiresAt;
    }

    if (payload.planTier !== undefined) {
      updatePayload.plan_tier = payload.planTier;
    }

    if (payload.subscriptionCancelAt !== undefined) {
      updatePayload.subscription_cancel_at = payload.subscriptionCancelAt;
    }

    if (payload.pendingPlanTier !== undefined) {
      updatePayload.pending_plan_tier = payload.pendingPlanTier;
    }

    if (payload.pendingPlanPaymentId !== undefined) {
      updatePayload.pending_plan_payment_id = payload.pendingPlanPaymentId;
    }

    if (payload.pendingPlanInvoiceUrl !== undefined) {
      updatePayload.pending_plan_invoice_url = payload.pendingPlanInvoiceUrl;
    }

    if (payload.pendingPlanEffectiveAt !== undefined) {
      updatePayload.pending_plan_effective_at = payload.pendingPlanEffectiveAt;
    }

    applySubscriptionTrialFields(updatePayload, payload);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .update(updatePayload)
      .eq('id', tenantId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ? mapTenantRow(data as Tenant) : null;
  }

  async updateSupportAiEntitlement(
    tenantId: string,
    payload: {
      supportAiEnabled: boolean;
      supportAiAsaasSubscriptionId?: string | null;
      supportAiStatus?: SupportAiStatus | null;
    },
  ): Promise<Tenant> {
    const updatePayload: Record<string, string | boolean | null> = {
      support_ai_enabled: payload.supportAiEnabled,
      updated_at: new Date().toISOString(),
    };

    if (payload.supportAiAsaasSubscriptionId !== undefined) {
      updatePayload.support_ai_asaas_subscription_id =
        payload.supportAiAsaasSubscriptionId;
    }

    if (payload.supportAiStatus !== undefined) {
      updatePayload.support_ai_status = payload.supportAiStatus;
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .update(updatePayload)
      .eq('id', tenantId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException(`Tenant with id "${tenantId}" was not found`);
    }

    return mapTenantRow(data as Tenant);
  }

  async checkSlugAvailability(
    rawSlug: string,
  ): Promise<SlugAvailabilityResponseDto> {
    const slug = normalizeSlug(rawSlug);

    if (!isValidSlug(slug)) {
      return { slug, available: false };
    }

    const existing = await this.findBySlug(slug);
    return { slug, available: !existing };
  }

  private normalizeTrackingData(dto: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    fbclid?: string;
    first_visit_at?: string | number;
  }): TenantTrackingData {
    return {
      utmSource: this.normalizeOptionalText(dto.utm_source),
      utmMedium: this.normalizeOptionalText(dto.utm_medium),
      utmCampaign: this.normalizeOptionalText(dto.utm_campaign),
      utmContent: this.normalizeOptionalText(dto.utm_content),
      fbclid: this.normalizeOptionalText(dto.fbclid),
      firstVisitAt: normalizeFirstVisitAt(dto.first_visit_at),
    };
  }

  async register(
    dto: RegisterTenantDto,
    request?: Request,
  ): Promise<RegisterTenantResult> {
    const ownerName = dto.owner_name?.trim() ?? '';
    const email = dto.email?.trim().toLowerCase() ?? '';
    const password = dto.password ?? '';
    const tenantName = dto.tenant_name?.trim() ?? '';
    const normalizedSlug = normalizeSlug(dto.slug ?? '');

    if (!ownerName || !email || !password || !tenantName) {
      throw new BadRequestException('Preencha todos os campos obrigatórios.');
    }

    if (isDisposableEmail(email)) {
      throw new BadRequestException(DISPOSABLE_EMAIL_MESSAGE);
    }

    if (password.length < 8) {
      throw new BadRequestException(
        'A senha deve ter pelo menos 8 caracteres, com letras e números.',
      );
    }

    if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      throw new BadRequestException(
        'A senha deve ter pelo menos 8 caracteres, com letras e números.',
      );
    }

    if (!isValidSlug(normalizedSlug)) {
      throw new BadRequestException(
        'A URL personalizada deve conter apenas letras minúsculas, números e traços.',
      );
    }

    const existingSlug = await this.findBySlug(normalizedSlug);

    if (existingSlug) {
      throw new ConflictException(
        'Esta URL já está em uso. Escolha outro endereço para sua empresa.',
      );
    }

    const skipEmailVerification = !isProductionAppEnv(
      this.configService.get<string>('APP_ENV'),
    );

    const { data: authData, error: authError } = await this.supabaseService
      .getClient()
      .auth.admin.createUser({
        email,
        password,
        email_confirm: skipEmailVerification,
        user_metadata: {
          full_name: ownerName,
          ...(skipEmailVerification
            ? {}
            : { [REQUIRES_EMAIL_VERIFICATION_METADATA_KEY]: true }),
        },
      });

    if (authError || !authData.user) {
      const message = authError?.message?.toLowerCase() ?? '';

      if (message.includes('already') || message.includes('registered')) {
        throw new ConflictException('Este e-mail já está cadastrado.');
      }

      throw new BadRequestException(
        authError?.message ?? 'Não foi possível criar sua conta.',
      );
    }

    const ownerId = authData.user.id;
    const { trialStartsAt, trialEndsAt } = buildTrialPeriod(new Date());
    const attribution =
      await this.affiliatesService.resolveAttributionForSignup({
        affiliateCode: dto.affiliate_code,
        signupEmail: email,
        signupUserId: ownerId,
      });

    const trackingData = this.normalizeTrackingData(dto);

    const { data: tenantData, error: tenantError } = await this.supabaseService
      .getClient()
      .from('tenants')
      .insert({
        name: tenantName,
        slug: normalizedSlug,
        primary_color: '#0F5F58',
        owner_id: ownerId,
        subscription_status: 'INACTIVE',
        plan_tier: TRIAL_DEFAULT_PLAN_TIER,
        trial_starts_at: trialStartsAt,
        trial_ends_at: trialEndsAt,
        referred_by_affiliate_id: attribution?.affiliateId ?? null,
        affiliate_attributed_at: attribution?.attributedAt ?? null,
        utm_source: trackingData.utmSource,
        utm_medium: trackingData.utmMedium,
        utm_campaign: trackingData.utmCampaign,
        utm_content: trackingData.utmContent,
        fbclid: trackingData.fbclid,
        first_visit_at: trackingData.firstVisitAt,
      })
      .select('*')
      .single();

    if (tenantError || !tenantData) {
      await this.supabaseService.getClient().auth.admin.deleteUser(ownerId);

      if (tenantError?.code === '23505') {
        throw new ConflictException(
          'Esta URL já está em uso. Escolha outro endereço para sua empresa.',
        );
      }

      throw new InternalServerErrorException(
        tenantError?.message ?? 'Não foi possível criar o estabelecimento.',
      );
    }

    await this.tenantUsersService.createOwnerMembership(tenantData.id, ownerId);
    await this.seedDefaultOperationalSetup(
      tenantData.id as string,
      ownerId,
      ownerName,
    );

    void this.notifyNewTenantSignup({
      name: tenantData.name as string,
      slug: tenantData.slug as string,
      ownerEmail: email,
    }).catch(() => undefined);

    void this.sendMetaCompleteRegistrationEvent({
      email,
      userId: ownerId,
      dto,
      request,
      trackingData,
    }).catch(() => undefined);

    if (skipEmailVerification) {
      this.logger.log(
        'Skipping establishment email verification outside production.',
      );
      try {
        await this.sendTrialWelcomeEmail(
          tenantData.id as string,
          email,
          ownerId,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to queue trial welcome after register: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      return {
        tenant: mapTenantRow(tenantData as Tenant),
        requiresEmailConfirmation: false,
        email,
      };
    }

    const otpType = await this.sendEstablishmentEmailVerification({
      email,
      ownerName,
    });

    return {
      tenant: mapTenantRow(tenantData as Tenant),
      requiresEmailConfirmation: true,
      email,
      otpType,
    };
  }

  async onboardForAuthenticatedUser(
    userId: string,
    dto: OnboardTenantDto,
    request?: Request,
  ): Promise<Tenant> {
    const existing = await this.findMeResponse(userId);

    if (existing) {
      throw new ConflictException(
        'Esta conta já está vinculada a um estabelecimento.',
      );
    }

    const ownerName = dto.owner_name?.trim() ?? '';
    const tenantName = dto.tenant_name?.trim() ?? '';
    const normalizedSlug = normalizeSlug(dto.slug ?? '');

    if (!ownerName || !tenantName) {
      throw new BadRequestException('Preencha todos os campos obrigatórios.');
    }

    if (!isValidSlug(normalizedSlug)) {
      throw new BadRequestException(
        'A URL personalizada deve conter apenas letras minúsculas, números e traços.',
      );
    }

    const existingSlug = await this.findBySlug(normalizedSlug);

    if (existingSlug) {
      throw new ConflictException(
        'Esta URL já está em uso. Escolha outro endereço para sua empresa.',
      );
    }

    const { trialStartsAt, trialEndsAt } = buildTrialPeriod(new Date());
    const attribution =
      await this.affiliatesService.resolveAttributionForSignup({
        affiliateCode: dto.affiliate_code,
        signupUserId: userId,
      });

    const trackingData = this.normalizeTrackingData(dto);

    const { data: tenantData, error: tenantError } = await this.supabaseService
      .getClient()
      .from('tenants')
      .insert({
        name: tenantName,
        slug: normalizedSlug,
        primary_color: '#0F5F58',
        owner_id: userId,
        subscription_status: 'INACTIVE',
        plan_tier: TRIAL_DEFAULT_PLAN_TIER,
        trial_starts_at: trialStartsAt,
        trial_ends_at: trialEndsAt,
        referred_by_affiliate_id: attribution?.affiliateId ?? null,
        affiliate_attributed_at: attribution?.attributedAt ?? null,
        utm_source: trackingData.utmSource,
        utm_medium: trackingData.utmMedium,
        utm_campaign: trackingData.utmCampaign,
        utm_content: trackingData.utmContent,
        fbclid: trackingData.fbclid,
        first_visit_at: trackingData.firstVisitAt,
      })
      .select('*')
      .single();

    if (tenantError || !tenantData) {
      if (tenantError?.code === '23505') {
        throw new ConflictException(
          'Esta URL já está em uso. Escolha outro endereço para sua empresa.',
        );
      }

      throw new InternalServerErrorException(
        tenantError?.message ?? 'Não foi possível criar o estabelecimento.',
      );
    }

    await this.tenantUsersService.createOwnerMembership(tenantData.id, userId);
    await this.seedDefaultOperationalSetup(
      tenantData.id as string,
      userId,
      ownerName,
    );

    await this.supabaseService.getClient().auth.admin.updateUserById(userId, {
      user_metadata: { full_name: ownerName },
    });

    void this.notifyNewTenantSignup({
      name: tenantData.name as string,
      slug: tenantData.slug as string,
      ownerUserId: userId,
    }).catch(() => undefined);

    this.queueTrialWelcomeEmail(tenantData.id as string, undefined, userId);

    const { data: authUser } = await this.supabaseService
      .getClient()
      .auth.admin.getUserById(userId);

    const email = authUser?.user?.email;

    if (email) {
      void this.sendMetaCompleteRegistrationEvent({
        email,
        userId,
        dto,
        request,
        trackingData,
      }).catch(() => undefined);
    }

    return mapTenantRow(tenantData as Tenant);
  }

  private async seedDefaultOperationalSetup(
    tenantId: string,
    ownerUserId: string,
    ownerName: string,
  ): Promise<void> {
    try {
      await this.seedDefaultBusinessHours(tenantId);
      await this.seedOwnerProfessional(tenantId, ownerUserId, ownerName);
    } catch (error) {
      this.logger.warn(
        `Failed to seed default setup for tenant ${tenantId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async seedDefaultBusinessHours(tenantId: string): Promise<void> {
    const defaultWeek = [
      { dayOfWeek: 0, openTime: '09:00', closeTime: '18:00', isClosed: true },
      { dayOfWeek: 1, openTime: '09:00', closeTime: '18:00', isClosed: false },
      { dayOfWeek: 2, openTime: '09:00', closeTime: '18:00', isClosed: false },
      { dayOfWeek: 3, openTime: '09:00', closeTime: '18:00', isClosed: false },
      { dayOfWeek: 4, openTime: '09:00', closeTime: '18:00', isClosed: false },
      { dayOfWeek: 5, openTime: '09:00', closeTime: '18:00', isClosed: false },
      { dayOfWeek: 6, openTime: '09:00', closeTime: '14:00', isClosed: false },
    ];

    const { error } = await this.supabaseService
      .getClient()
      .from('business_hours')
      .insert(
        defaultWeek.map((item) => ({
          tenant_id: tenantId,
          day_of_week: item.dayOfWeek,
          open_time: item.openTime,
          close_time: item.closeTime,
          is_closed: item.isClosed,
        })),
      );

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  private async seedOwnerProfessional(
    tenantId: string,
    ownerUserId: string,
    ownerName: string,
  ): Promise<void> {
    const name = ownerName.trim() || 'Profissional';

    const { data, error } = await this.supabaseService
      .getClient()
      .from('professionals')
      .insert({
        tenant_id: tenantId,
        name,
        contact_phone: null,
        avatar_url: null,
        commission_percent: 0,
        product_commission_percent: null,
        booking_acceptance_type: 'DEFAULT',
        is_active: true,
        deleted_at: null,
      })
      .select('id')
      .single();

    if (error || !data?.id) {
      throw new InternalServerErrorException(
        error?.message ?? 'Não foi possível criar o profissional do dono.',
      );
    }

    await this.tenantUsersService.linkOwnerProfessionalMembership(
      tenantId,
      ownerUserId,
      data.id as string,
    );
  }

  private async notifyNewTenantSignup(params: {
    name: string;
    slug: string;
    ownerEmail?: string;
    ownerUserId?: string;
  }): Promise<void> {
    let ownerEmail = params.ownerEmail;

    if (!ownerEmail && params.ownerUserId) {
      try {
        const { data: authUser } = await this.supabaseService
          .getClient()
          .auth.admin.getUserById(params.ownerUserId);
        ownerEmail = authUser?.user?.email;
      } catch {
        ownerEmail = undefined;
      }
    }

    await this.ntfyService.notifyNewTenant({
      name: params.name,
      slug: params.slug,
      ownerEmail,
    });
  }

  assertEstablishmentEmailVerified(user: {
    email_confirmed_at?: string | null;
    user_metadata?: Record<string, unknown>;
  }): void {
    if (
      !isProductionAppEnv(this.configService.get<string>('APP_ENV')) ||
      !requiresEstablishmentEmailVerification(user)
    ) {
      return;
    }

    throw new ForbiddenException(ESTABLISHMENT_EMAIL_NOT_CONFIRMED_MESSAGE);
  }

  async resendEstablishmentEmailVerification(emailRaw: string): Promise<void> {
    const email = emailRaw.trim().toLowerCase();

    if (!email) {
      throw new BadRequestException('Informe seu e-mail.');
    }

    if (isDisposableEmail(email)) {
      throw new BadRequestException(DISPOSABLE_EMAIL_MESSAGE);
    }

    await this.sendEstablishmentEmailVerification({
      email,
      ownerName: '',
      requirePendingFlag: true,
    });
  }

  async changeEstablishmentSignupEmail(
    currentEmailRaw: string,
    newEmailRaw: string,
  ): Promise<{ email: string; otpType: string }> {
    const currentEmail = currentEmailRaw.trim().toLowerCase();
    const newEmail = newEmailRaw.trim().toLowerCase();

    if (!currentEmail || !newEmail) {
      throw new BadRequestException('Informe o e-mail atual e o novo e-mail.');
    }

    if (isDisposableEmail(newEmail)) {
      throw new BadRequestException(DISPOSABLE_EMAIL_MESSAGE);
    }

    if (currentEmail === newEmail) {
      const otpType = await this.sendEstablishmentEmailVerification({
        email: newEmail,
        ownerName: '',
        requirePendingFlag: true,
      });
      return { email: newEmail, otpType };
    }

    const pendingUser =
      await this.getPendingEstablishmentAuthUser(currentEmail);
    const ownerName =
      typeof pendingUser.user_metadata?.full_name === 'string'
        ? pendingUser.user_metadata.full_name
        : '';

    const { error: updateError } = await this.supabaseService
      .getClient()
      .auth.admin.updateUserById(pendingUser.id, {
        email: newEmail,
        email_confirm: false,
        user_metadata: {
          ...pendingUser.user_metadata,
          [REQUIRES_EMAIL_VERIFICATION_METADATA_KEY]: true,
        },
      });

    if (updateError) {
      const message = updateError.message?.toLowerCase() ?? '';

      if (
        message.includes('already') ||
        message.includes('registered') ||
        message.includes('exists')
      ) {
        throw new ConflictException(ESTABLISHMENT_EMAIL_IN_USE_MESSAGE);
      }

      throw new BadRequestException(
        ESTABLISHMENT_VERIFICATION_SEND_FAILED_MESSAGE,
      );
    }

    const otpType = await this.sendEstablishmentEmailVerification({
      email: newEmail,
      ownerName,
      requirePendingFlag: true,
    });

    return { email: newEmail, otpType };
  }

  async verifyEstablishmentEmailCode(
    emailRaw: string,
    codeRaw: string,
  ): Promise<{ hashedToken: string; otpType: string }> {
    const email = emailRaw.trim().toLowerCase();
    const code = normalizeEstablishmentOtpCode(codeRaw);

    if (!email || !isSixDigitOtp(code)) {
      throw new BadRequestException(ESTABLISHMENT_OTP_INVALID_MESSAGE);
    }

    const user = await this.getPendingEstablishmentAuthUser(email);
    const metadata = this.readUserMetadata(user.user_metadata);
    const attempts = readEstablishmentOtpAttempts(
      metadata[ESTABLISHMENT_OTP_ATTEMPTS_KEY],
    );

    if (attempts >= ESTABLISHMENT_OTP_MAX_ATTEMPTS) {
      throw new BadRequestException(ESTABLISHMENT_OTP_LOCKED_MESSAGE);
    }

    const expectedHash = metadata[ESTABLISHMENT_OTP_HASH_KEY];
    const expired = isEstablishmentOtpExpired(
      metadata[ESTABLISHMENT_OTP_EXPIRES_AT_KEY],
    );
    const matches =
      typeof expectedHash === 'string' &&
      expectedHash === hashEstablishmentOtp(user.id, code);

    if (expired || !matches) {
      await this.supabaseService
        .getClient()
        .auth.admin.updateUserById(user.id, {
          user_metadata: {
            ...metadata,
            [ESTABLISHMENT_OTP_ATTEMPTS_KEY]: attempts + 1,
          },
        });
      throw new BadRequestException(ESTABLISHMENT_OTP_INVALID_MESSAGE);
    }

    const { error: confirmError } = await this.supabaseService
      .getClient()
      .auth.admin.updateUserById(user.id, {
        email_confirm: true,
        user_metadata: this.withoutOtpMetadata(metadata),
      });

    if (!confirmError) {
      try {
        await this.sendTrialWelcomeForOwnerUser(user.id, email);
      } catch (error) {
        this.logger.warn(
          `Failed to queue trial welcome after code verification: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const frontendUrl = this.resolveFrontendUrl();
    const { data, error } = await this.supabaseService
      .getClient()
      .auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: {
          redirectTo: `${frontendUrl.replace(/\/+$/, '')}/auth/callback?intent=tenant-register`,
        },
      });

    const hashedToken = data?.properties?.hashed_token?.trim();
    const otpType = data?.properties?.verification_type?.trim() || 'magiclink';

    if (error || !hashedToken) {
      throw new InternalServerErrorException(
        'E-mail confirmado. Entre no painel com sua senha.',
      );
    }

    return { hashedToken, otpType };
  }

  private readUserMetadata(metadata: unknown): Record<string, unknown> {
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      return { ...(metadata as Record<string, unknown>) };
    }

    return {};
  }

  private withoutOtpMetadata(
    metadata: Record<string, unknown>,
  ): Record<string, unknown> {
    const next = { ...metadata };
    delete next[ESTABLISHMENT_OTP_HASH_KEY];
    delete next[ESTABLISHMENT_OTP_EXPIRES_AT_KEY];
    delete next[ESTABLISHMENT_OTP_ATTEMPTS_KEY];
    return next;
  }

  private resolveFrontendUrl(): string {
    return (
      this.configService.get<string>('FRONTEND_URL')?.trim() ||
      'http://localhost:5173'
    );
  }

  private async getPendingEstablishmentAuthUser(email: string) {
    const frontendUrl = this.resolveFrontendUrl();
    const { data, error } = await this.supabaseService
      .getClient()
      .auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: {
          redirectTo: `${frontendUrl.replace(/\/+$/, '')}/auth/callback?intent=tenant-register`,
        },
      });

    const user = data?.user;

    if (error || !user) {
      throw new BadRequestException(
        ESTABLISHMENT_VERIFICATION_SEND_FAILED_MESSAGE,
      );
    }

    if (user.email_confirmed_at) {
      throw new ConflictException(
        ESTABLISHMENT_EMAIL_ALREADY_CONFIRMED_MESSAGE,
      );
    }

    if (!requiresEstablishmentEmailVerification(user)) {
      throw new BadRequestException(
        ESTABLISHMENT_VERIFICATION_SEND_FAILED_MESSAGE,
      );
    }

    return user;
  }

  private async sendEstablishmentEmailVerification(params: {
    email: string;
    ownerName: string;
    requirePendingFlag?: boolean;
  }): Promise<string> {
    const frontendUrl = this.resolveFrontendUrl();

    const { data, error } = await this.supabaseService
      .getClient()
      .auth.admin.generateLink({
        type: 'magiclink',
        email: params.email,
        options: {
          redirectTo: `${frontendUrl.replace(/\/+$/, '')}/auth/callback?intent=tenant-register`,
        },
      });

    const properties = data?.properties;
    const user = data?.user;
    const hashedToken = properties?.hashed_token?.trim();
    const otpType = properties?.verification_type?.trim() || 'magiclink';

    if (error || !user || !hashedToken) {
      throw new InternalServerErrorException(
        ESTABLISHMENT_VERIFICATION_SEND_FAILED_MESSAGE,
      );
    }

    if (user.email_confirmed_at) {
      throw new ConflictException(
        ESTABLISHMENT_EMAIL_ALREADY_CONFIRMED_MESSAGE,
      );
    }

    if (
      params.requirePendingFlag &&
      !requiresEstablishmentEmailVerification(user)
    ) {
      throw new BadRequestException(
        ESTABLISHMENT_VERIFICATION_SEND_FAILED_MESSAGE,
      );
    }

    const code = generateEstablishmentOtp();
    const metadata = this.readUserMetadata(user.user_metadata);

    const { error: otpStoreError } = await this.supabaseService
      .getClient()
      .auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...metadata,
          [REQUIRES_EMAIL_VERIFICATION_METADATA_KEY]: true,
          [ESTABLISHMENT_OTP_HASH_KEY]: hashEstablishmentOtp(user.id, code),
          [ESTABLISHMENT_OTP_EXPIRES_AT_KEY]: new Date(
            Date.now() + ESTABLISHMENT_OTP_TTL_MS,
          ).toISOString(),
          [ESTABLISHMENT_OTP_ATTEMPTS_KEY]: 0,
        },
      });

    if (otpStoreError) {
      throw new InternalServerErrorException(
        ESTABLISHMENT_VERIFICATION_SEND_FAILED_MESSAGE,
      );
    }

    const verifyUrl = buildEstablishmentVerificationCallbackUrl(
      frontendUrl,
      hashedToken,
      otpType,
    );

    try {
      await this.mailService.sendEstablishmentEmailVerification({
        recipientEmail: params.email,
        ownerName: params.ownerName.trim(),
        code,
        verifyUrl,
      });
    } catch (mailError) {
      if (
        mailError instanceof ConflictException ||
        mailError instanceof BadRequestException
      ) {
        throw mailError;
      }

      throw new InternalServerErrorException(
        ESTABLISHMENT_VERIFICATION_SEND_FAILED_MESSAGE,
      );
    }

    return otpType;
  }

  scheduleTrialWelcomeForConfirmedOwner(params: {
    tenantId: string;
    role: string;
    ownerUserId: string;
    ownerEmail?: string | null;
    emailConfirmedAt?: string | null;
  }): void {
    if (params.role !== 'OWNER' || !params.emailConfirmedAt) {
      return;
    }

    this.queueTrialWelcomeEmail(
      params.tenantId,
      params.ownerEmail ?? undefined,
      params.ownerUserId,
    );
  }

  private queueTrialWelcomeEmail(
    tenantId: string,
    ownerEmail?: string,
    ownerUserId?: string,
  ): void {
    void this.sendTrialWelcomeEmail(tenantId, ownerEmail, ownerUserId).catch(
      (error) => {
        this.logger.warn(
          `Failed to queue trial welcome for tenant ${tenantId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      },
    );
  }

  private async sendTrialWelcomeForOwnerUser(
    ownerUserId: string,
    email: string,
  ): Promise<void> {
    const tenant = await this.findByOwnerId(ownerUserId);

    if (!tenant) {
      this.logger.warn(
        `Skipped trial welcome because no tenant was found for owner ${ownerUserId}.`,
      );
      return;
    }

    await this.sendTrialWelcomeEmail(tenant.id, email, ownerUserId);
  }

  private async sendTrialWelcomeEmail(
    tenantId: string,
    ownerEmail?: string,
    ownerUserId?: string,
  ): Promise<void> {
    let email = ownerEmail?.trim().toLowerCase();

    if (!email && ownerUserId) {
      const { data: authUser } = await this.supabaseService
        .getClient()
        .auth.admin.getUserById(ownerUserId);
      email = authUser?.user?.email?.trim().toLowerCase();
    }

    if (!email) {
      return;
    }

    await this.emailFunnelService.sendWelcomeForNewTenant({
      tenantId,
      ownerEmail: email,
    });
  }

  async updateAsaasCustomerId(
    tenantId: string,
    asaasCustomerId: string,
  ): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .update({
        asaas_customer_id: asaasCustomerId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  async updateAsaasAccountStatus(
    tenantId: string,
    payload: {
      asaasAccountId?: string | null;
      asaasWalletId?: string | null;
      asaasChargesEnabled?: boolean;
      asaasDetailsSubmitted?: boolean;
      asaasAccountStatus?: string | null;
    },
  ): Promise<Tenant | null> {
    const updatePayload: Record<string, string | boolean | null> = {
      updated_at: new Date().toISOString(),
    };

    if (payload.asaasAccountId !== undefined) {
      updatePayload.asaas_account_id = payload.asaasAccountId;
    }

    if (payload.asaasWalletId !== undefined) {
      updatePayload.asaas_wallet_id = payload.asaasWalletId;
    }

    if (payload.asaasChargesEnabled !== undefined) {
      updatePayload.asaas_charges_enabled = payload.asaasChargesEnabled;
    }

    if (payload.asaasDetailsSubmitted !== undefined) {
      updatePayload.asaas_details_submitted = payload.asaasDetailsSubmitted;
    }

    if (payload.asaasAccountStatus !== undefined) {
      updatePayload.asaas_account_status = payload.asaasAccountStatus;
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .update(updatePayload)
      .eq('id', tenantId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ? mapTenantRow(data as Tenant) : null;
  }

  async claimDailyDepositChargeAlert(
    tenantId: string,
    alertedOn: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .update({
        deposit_charge_alerted_on: alertedOn,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId)
      .or(
        `deposit_charge_alerted_on.is.null,deposit_charge_alerted_on.lt.${alertedOn}`,
      )
      .select('id')
      .maybeSingle();

    if (error) {
      this.logger.warn(
        `Failed to claim deposit charge alert for tenant ${tenantId}: ${error.message}`,
      );
      return false;
    }

    return Boolean(data && typeof data === 'object' && 'id' in data);
  }

  async saveAsaasSubaccountApiKey(
    tenantId: string,
    encryptedApiKey: string,
  ): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .update({
        asaas_subaccount_api_key_encrypted: encryptedApiKey,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  async findAsaasSubaccountApiKeyCiphertext(
    tenantId: string,
  ): Promise<string | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select('asaas_subaccount_api_key_encrypted')
      .eq('id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const ciphertext = (
      data as { asaas_subaccount_api_key_encrypted?: string | null } | null
    )?.asaas_subaccount_api_key_encrypted;

    return ciphertext?.trim() || null;
  }

  async findByAsaasAccountId(asaasAccountId: string): Promise<Tenant | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select('*')
      .eq('asaas_account_id', asaasAccountId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ? mapTenantRow(data as Tenant) : null;
  }

  private normalizeContactPhone(phone?: string | null): string | null {
    return this.normalizeOptionalText(phone);
  }

  private normalizeOptionalText(value?: string | null): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeCep(cep?: string | null): string | null {
    if (cep === undefined || cep === null) {
      return null;
    }

    const digits = cep.replace(/\D/g, '').slice(0, 8);

    if (digits.length === 0) {
      return null;
    }

    if (digits.length <= 5) {
      return digits;
    }

    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }

  private normalizeState(state?: string | null): string | null {
    if (state === undefined || state === null) {
      return null;
    }

    const normalized = state.trim().toUpperCase().slice(0, 2);
    return normalized.length > 0 ? normalized : null;
  }

  private resolveNonNegativeInteger(
    nextValue: number | undefined,
    currentValue: number,
  ): number {
    if (nextValue === undefined) {
      return currentValue;
    }

    if (!Number.isInteger(nextValue) || nextValue < 0) {
      throw new BadRequestException(
        'Os pontos de indicação devem ser números inteiros maiores ou iguais a zero.',
      );
    }

    return nextValue;
  }

  private async sendMetaCompleteRegistrationEvent(params: {
    email: string;
    userId: string;
    dto: RegisterTenantDto | OnboardTenantDto;
    request?: Request;
    trackingData?: TenantTrackingData;
  }): Promise<void> {
    const clientIpAddress = params.request
      ? getClientIp(params.request)
      : undefined;
    const clientUserAgent = params.request?.headers['user-agent'];
    const referer = params.request?.headers.referer;
    const origin = params.request?.headers.origin;

    const eventSourceUrl =
      referer || origin || 'https://horariocerto.app/register';

    let fbp = params.dto.fbp;
    let fbc = params.dto.fbc;

    if (!fbp && params.request?.headers.cookie) {
      const cookies = params.request.headers.cookie.split(';');
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === '_fbp' && !fbp) {
          fbp = value;
        } else if (name === '_fbc' && !fbc) {
          fbc = value;
        }
      }
    }

    const eventId =
      ('metaEventId' in params.dto ? params.dto.metaEventId : undefined) ||
      ('event_id' in params.dto ? params.dto.event_id : undefined);

    await this.metaCapiService.sendCompleteRegistration({
      email: params.email,
      userId: params.userId,
      clientIpAddress,
      clientUserAgent,
      eventSourceUrl,
      eventId,
      fbp,
      fbc,
      fbclid: params.trackingData?.fbclid || undefined,
      firstVisitAt: params.trackingData?.firstVisitAt || undefined,
    });
  }
}
