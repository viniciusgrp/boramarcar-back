import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { SlugAvailabilityResponseDto } from './dto/slug-availability.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import type { TenantBookingAcceptanceType } from '../booking/entities/booking-acceptance-type.type';
import {
  assertBookingSlotIntervalMinutes,
  normalizeBookingSlotIntervalMinutes,
} from '../booking/utils/booking-slot-interval.util';
import type { PlanTier } from './entities/plan-tier.type';
import type { SubscriptionStatus } from './entities/subscription-status.type';
import { Tenant } from './entities/tenant.entity';
import {
  isStoredSlug,
  isValidSlug,
  normalizeSlug,
  resolveSlugForUpdate,
} from './utils/slug.util';
import { normalizePlanTier } from './utils/plan-tier.util';
import { buildTrialPeriod, TRIAL_DEFAULT_PLAN_TIER } from './utils/trial-period.util';
import { normalizeCalendarCardPreferences } from './utils/calendar-card-preferences.util';
import { normalizePayoutFrequency } from './entities/payout-frequency.type';
import { TenantUsersService } from './tenant-users.service';
import type { TenantAccessContext } from './entities/tenant-access-context.entity';
import type { TenantMeResponse } from './entities/tenant-me-response.entity';
import type { TenantUser } from './entities/tenant-user.entity';

export interface TenantSubscriptionUpdatePayload {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiresAt?: string | null;
  planTier?: PlanTier;
  trialEndsAt?: string | null;
  preSubscriptionTrialEndsAt?: string | null;
}

function applySubscriptionTrialFields(
  updatePayload: Record<string, string | null>,
  payload: Pick<
    TenantSubscriptionUpdatePayload,
    'trialEndsAt' | 'preSubscriptionTrialEndsAt'
  >,
): void {
  if (payload.trialEndsAt !== undefined) {
    updatePayload.trial_ends_at = payload.trialEndsAt;
  }

  if (payload.preSubscriptionTrialEndsAt !== undefined) {
    updatePayload.pre_subscription_trial_ends_at =
      payload.preSubscriptionTrialEndsAt;
  }
}

function mapTenantRow(row: Tenant): Tenant {
  const subscriptionStatus = row.subscription_status;

  return {
    ...row,
    pre_subscription_trial_ends_at: row.pre_subscription_trial_ends_at ?? null,
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
    require_customer_email_confirmation: Boolean(
      row.require_customer_email_confirmation,
    ),
    allow_customer_self_cancellation: Boolean(
      row.allow_customer_self_cancellation,
    ),
    booking_slot_interval_minutes: normalizeBookingSlotIntervalMinutes(
      row.booking_slot_interval_minutes,
    ),
  };
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
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly tenantUsersService: TenantUsersService,
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
      tenant: accessContext.tenant,
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

  async updateForOwner(
    ownerId: string,
    dto: UpdateTenantDto,
  ): Promise<Tenant> {
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
        primary_color: dto.primaryColor.trim(),
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
        address_neighborhood: this.normalizeOptionalText(dto.addressNeighborhood),
        address_city: this.normalizeOptionalText(dto.addressCity),
        address_state: this.normalizeState(dto.addressState),
        require_deposit: dto.requireDeposit,
        require_customer_email_confirmation:
          dto.requireCustomerEmailConfirmation ??
          tenant.require_customer_email_confirmation,
        allow_customer_self_cancellation:
          dto.allowCustomerSelfCancellation ??
          tenant.allow_customer_self_cancellation,
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

  async findByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<Tenant | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select('*')
      .eq('stripe_customer_id', stripeCustomerId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ? mapTenantRow(data as Tenant) : null;
  }

  async findByStripeSubscriptionId(
    stripeSubscriptionId: string,
  ): Promise<Tenant | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select('*')
      .eq('stripe_subscription_id', stripeSubscriptionId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ? mapTenantRow(data as Tenant) : null;
  }

  async updateSubscriptionByStripeCustomerId(
    stripeCustomerId: string,
    payload: TenantSubscriptionUpdatePayload,
  ): Promise<Tenant | null> {
    const updatePayload: Record<string, string | null> = {
      subscription_status: payload.subscriptionStatus,
      updated_at: new Date().toISOString(),
    };

    if (payload.stripeSubscriptionId !== undefined) {
      updatePayload.stripe_subscription_id = payload.stripeSubscriptionId;
    }

    if (payload.subscriptionExpiresAt !== undefined) {
      updatePayload.subscription_expires_at = payload.subscriptionExpiresAt;
    }

    if (payload.planTier !== undefined) {
      updatePayload.plan_tier = payload.planTier;
    }

    applySubscriptionTrialFields(updatePayload, payload);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .update(updatePayload)
      .eq('stripe_customer_id', stripeCustomerId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ? mapTenantRow(data as Tenant) : null;
  }

  async updateSubscriptionByStripeSubscriptionId(
    stripeSubscriptionId: string,
    payload: TenantSubscriptionUpdatePayload,
  ): Promise<Tenant | null> {
    const updatePayload: Record<string, string | null> = {
      subscription_status: payload.subscriptionStatus,
      updated_at: new Date().toISOString(),
    };

    if (payload.subscriptionExpiresAt !== undefined) {
      updatePayload.subscription_expires_at = payload.subscriptionExpiresAt;
    }

    if (payload.planTier !== undefined) {
      updatePayload.plan_tier = payload.planTier;
    }

    applySubscriptionTrialFields(updatePayload, payload);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .update(updatePayload)
      .eq('stripe_subscription_id', stripeSubscriptionId)
      .select('*')
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

    if (payload.stripeCustomerId !== undefined) {
      updatePayload.stripe_customer_id = payload.stripeCustomerId;
    }

    if (payload.stripeSubscriptionId !== undefined) {
      updatePayload.stripe_subscription_id = payload.stripeSubscriptionId;
    }

    if (payload.subscriptionExpiresAt !== undefined) {
      updatePayload.subscription_expires_at = payload.subscriptionExpiresAt;
    }

    if (payload.planTier !== undefined) {
      updatePayload.plan_tier = payload.planTier;
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

  async register(dto: RegisterTenantDto): Promise<Tenant> {
    const ownerName = dto.owner_name?.trim() ?? '';
    const email = dto.email?.trim().toLowerCase() ?? '';
    const password = dto.password ?? '';
    const tenantName = dto.tenant_name?.trim() ?? '';
    const normalizedSlug = normalizeSlug(dto.slug ?? '');

    if (!ownerName || !email || !password || !tenantName) {
      throw new BadRequestException('Preencha todos os campos obrigatórios.');
    }

    if (password.length < 6) {
      throw new BadRequestException('A senha deve ter pelo menos 6 caracteres.');
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

    const { data: authData, error: authError } = await this.supabaseService
      .getClient()
      .auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: ownerName },
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

    const { data: tenantData, error: tenantError } = await this.supabaseService
      .getClient()
      .from('tenants')
      .insert({
        name: tenantName,
        slug: normalizedSlug,
        primary_color: '#111827',
        require_deposit: false,
        owner_id: ownerId,
        subscription_status: 'INACTIVE',
        plan_tier: TRIAL_DEFAULT_PLAN_TIER,
        trial_starts_at: trialStartsAt,
        trial_ends_at: trialEndsAt,
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

    return mapTenantRow(tenantData as Tenant);
  }

  async updateStripeCustomerId(
    tenantId: string,
    stripeCustomerId: string,
  ): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .update({
        stripe_customer_id: stripeCustomerId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
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
}
