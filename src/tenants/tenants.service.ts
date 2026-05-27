import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import type { SubscriptionStatus } from './entities/subscription-status.type';
import { Tenant } from './entities/tenant.entity';

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
  };
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

    const normalizedSlug = this.normalizeSlug(dto.slug);
    const slugTaken = await this.isSlugTakenByAnotherTenant(
      normalizedSlug,
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
        slug: normalizedSlug,
        primary_color: dto.primaryColor.trim(),
        contact_phone: this.normalizeContactPhone(dto.contactPhone),
        require_deposit: dto.requireDeposit,
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
    },
  ): Promise<Tenant | null> {
    const updatePayload: Record<string, string | null> = {
      subscription_status: payload.subscriptionStatus,
      updated_at: new Date().toISOString(),
    };

    if (payload.subscriptionExpiresAt !== undefined) {
      updatePayload.subscription_expires_at = payload.subscriptionExpiresAt;
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

  private normalizeSlug(slug: string): string {
    return slug
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private normalizeContactPhone(phone?: string | null): string | null {
    if (phone === undefined || phone === null) {
      return null;
    }

    const trimmed = phone.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
