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
import { buildTrialPeriod } from './utils/trial-period.util';

function mapTenantRow(row: Tenant): Tenant {
  const subscriptionStatus = row.subscription_status;

  return {
    ...row,
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
  };
}

function normalizeTenantBookingAcceptanceType(
  value: TenantBookingAcceptanceType | null | undefined,
): TenantBookingAcceptanceType {
  return value === 'MANUAL' ? 'MANUAL' : 'AUTOMATIC';
}

@Injectable()
export class TenantsService {
  constructor(private readonly supabaseService: SupabaseService) {}

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
    const tenant = await this.findByOwnerId(ownerId);

    if (!tenant) {
      throw new NotFoundException(
        'No establishment linked to the authenticated user',
      );
    }

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
        address_cep: this.normalizeCep(dto.addressCep),
        address_street: this.normalizeOptionalText(dto.addressStreet),
        address_number: this.normalizeOptionalText(dto.addressNumber),
        address_complement: this.normalizeOptionalText(dto.addressComplement),
        address_neighborhood: this.normalizeOptionalText(dto.addressNeighborhood),
        address_city: this.normalizeOptionalText(dto.addressCity),
        address_state: this.normalizeState(dto.addressState),
        require_deposit: dto.requireDeposit,
        booking_acceptance_type: normalizeTenantBookingAcceptanceType(
          dto.bookingAcceptanceType,
        ),
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenant.id)
      .eq('owner_id', ownerId)
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
    payload: {
      stripeSubscriptionId?: string | null;
      subscriptionStatus: SubscriptionStatus;
      subscriptionExpiresAt?: string | null;
      planTier?: PlanTier;
    },
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
    payload: {
      subscriptionStatus: SubscriptionStatus;
      subscriptionExpiresAt?: string | null;
      planTier?: PlanTier;
    },
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
    payload: {
      stripeCustomerId?: string | null;
      stripeSubscriptionId?: string | null;
      subscriptionStatus: SubscriptionStatus;
      subscriptionExpiresAt?: string | null;
      planTier?: PlanTier;
    },
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
}
