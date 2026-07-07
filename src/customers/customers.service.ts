import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import { ReferralService } from '../loyalty/referral.service';
import { normalizePhoneKey } from '../loyalty/utils/loyalty-points.util';
import { SupabaseService } from '../supabase/supabase.service';
import { TenantsService } from '../tenants/tenants.service';
import type { CompleteCustomerProfileDto } from './dto/complete-customer-profile.dto';
import type { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';
import type {
  Customer,
  CustomerListItem,
  CustomerMeResponse,
} from './entities/customer.entity';
import {
  isCustomerProfileComplete,
  normalizeAcquisitionSource,
  normalizeCustomerDisplayName,
  normalizeInstagramHandle,
  resolveCustomerDisplayName,
  resolveOAuthAvatarUrl,
  resolveOAuthDisplayName,
} from './utils/customer-profile.util';

export interface CustomerWithTenantSummary {
  customer: Customer;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  allowCustomerSelfCancellation: boolean;
  isProfileComplete: boolean;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly referralService: ReferralService,
    private readonly tenantsService: TenantsService,
  ) {}

  async registerWithEmailPassword(
    tenantId: string,
    email: string,
    password: string,
  ): Promise<void> {
    const normalizedTenantId = tenantId?.trim();

    if (!normalizedTenantId) {
      throw new BadRequestException('O campo "tenantId" é obrigatório.');
    }

    const tenant = await this.tenantsService.findById(normalizedTenantId);

    if (!tenant) {
      throw new NotFoundException('Estabelecimento não encontrado.');
    }

    if (tenant.require_customer_email_confirmation) {
      throw new BadRequestException(
        'Este estabelecimento exige confirmação de e-mail antes do primeiro acesso.',
      );
    }

    const normalizedEmail = email?.trim().toLowerCase() ?? '';

    if (!normalizedEmail) {
      throw new BadRequestException('Informe um e-mail válido.');
    }

    if (!password || password.length < 8) {
      throw new BadRequestException(
        'A senha deve ter pelo menos 8 caracteres, com letras e números.',
      );
    }

    const { data: authData, error: authError } = await this.supabaseService
      .getClient()
      .auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
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
  }

  async getMe(authUserId: string, tenantId: string): Promise<CustomerMeResponse> {
    const customer = await this.findByAuthUserForTenant(tenantId, authUserId);

    return {
      customer,
      isProfileComplete: isCustomerProfileComplete(customer),
    };
  }

  async findAllByAuthUserId(
    authUserId: string,
  ): Promise<CustomerWithTenantSummary[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('customers')
      .select('*, tenants ( id, name, slug, allow_customer_self_cancellation )')
      .eq('auth_user_id', authUserId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? [])
      .map((row) => {
        const tenantRelation = row.tenants as
          | {
              id: string;
              name: string;
              slug: string;
              allow_customer_self_cancellation?: boolean;
            }
          | {
              id: string;
              name: string;
              slug: string;
              allow_customer_self_cancellation?: boolean;
            }[]
          | null;
        const tenant = Array.isArray(tenantRelation)
          ? tenantRelation[0]
          : tenantRelation;

        if (!tenant?.id || !tenant.name || !tenant.slug) {
          return null;
        }

        const customer = this.mapCustomerRow(row as Customer);

        return {
          customer,
          tenantId: tenant.id,
          tenantName: tenant.name,
          tenantSlug: tenant.slug,
          allowCustomerSelfCancellation: Boolean(
            tenant.allow_customer_self_cancellation,
          ),
          isProfileComplete: isCustomerProfileComplete(customer),
        };
      })
      .filter((context): context is CustomerWithTenantSummary => context !== null);
  }

  async updateProfile(
    authUserId: string,
    dto: UpdateCustomerProfileDto,
  ): Promise<Customer> {
    const tenantId = dto.tenantId?.trim();

    if (!tenantId) {
      throw new BadRequestException('O campo "tenantId" é obrigatório.');
    }

    const existing = await this.findByAuthUserForTenant(tenantId, authUserId);

    if (!existing) {
      throw new NotFoundException('Perfil não encontrado neste estabelecimento.');
    }

    const profilePictureUrl =
      dto.profilePictureUrl === undefined
        ? existing.profile_picture_url
        : dto.profilePictureUrl?.trim() || null;
    const displayName =
      dto.name === undefined
        ? existing.name
        : normalizeCustomerDisplayName(dto.name) ?? existing.name;
    const instagramHandle =
      dto.instagramHandle === undefined
        ? existing.instagram_handle
        : normalizeInstagramHandle(dto.instagramHandle ?? undefined);
    const birthDate =
      dto.birthDate === undefined
        ? existing.birth_date
        : this.normalizeBirthDate(dto.birthDate ?? undefined);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('customers')
      .update({
        name: displayName,
        profile_picture_url: profilePictureUrl,
        instagram_handle: instagramHandle,
        birth_date: birthDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return this.mapCustomerRow(data as Customer);
  }

  async completeProfile(
    authUserId: string,
    user: User,
    dto: CompleteCustomerProfileDto,
  ): Promise<Customer> {
    const tenantId = dto.tenantId?.trim();
    const phone = dto.phone?.trim();

    if (!tenantId || !phone) {
      throw new BadRequestException(
        'Os campos "tenantId" e "phone" são obrigatórios.',
      );
    }

    const normalizedPhoneKey = normalizePhoneKey(phone);
    const displayName = resolveCustomerDisplayName(user, dto.name);

    if (!displayName) {
      throw new BadRequestException('Informe seu nome completo.');
    }

    const email = user.email?.trim().toLowerCase() || null;
    const profilePictureUrl = resolveOAuthAvatarUrl(user);
    const birthDate = this.normalizeBirthDate(dto.birthDate);
    const instagramHandle = normalizeInstagramHandle(dto.instagramHandle);
    const acquisitionSource = normalizeAcquisitionSource(dto.acquisitionSource);

    const existingByAuth = await this.findByAuthUserForTenant(
      tenantId,
      authUserId,
    );

    if (existingByAuth) {
      return this.updateCustomerProfile(existingByAuth, {
        name: displayName,
        phone: normalizedPhoneKey,
        email,
        birthDate,
        instagramHandle,
        acquisitionSource,
        profilePictureUrl,
        referralCode: dto.referralCode?.trim() || null,
        tenantId,
      });
    }

    const existingByPhone = await this.findByPhoneForTenant(
      tenantId,
      normalizedPhoneKey,
    );

    if (existingByPhone) {
      if (
        existingByPhone.auth_user_id &&
        existingByPhone.auth_user_id !== authUserId
      ) {
        throw new BadRequestException(
          'Este telefone já está vinculado a outra conta.',
        );
      }

      return this.updateCustomerProfile(existingByPhone, {
        authUserId,
        name: displayName,
        phone: normalizedPhoneKey,
        email,
        birthDate,
        instagramHandle,
        acquisitionSource,
        profilePictureUrl,
        referralCode: dto.referralCode?.trim() || null,
        tenantId,
      });
    }

    const referralCode =
      await this.referralService.generateReferralCodeForNewCustomer();

    const { data, error } = await this.supabaseService
      .getClient()
      .from('customers')
      .insert({
        tenant_id: tenantId,
        auth_user_id: authUserId,
        name: displayName,
        phone: normalizedPhoneKey,
        email,
        birth_date: birthDate,
        instagram_handle: instagramHandle,
        acquisition_source: acquisitionSource,
        profile_picture_url: profilePictureUrl,
        referral_code: referralCode,
        points_balance: 0,
      })
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const created = this.mapCustomerRow(data as Customer);

    return this.referralService.applyReferralLinkIfEligible(
      tenantId,
      created,
      dto.referralCode?.trim() || null,
    );
  }

  async resolveForAuthenticatedBooking(
    authUserId: string,
    tenantId: string,
    referralCode?: string | null,
  ): Promise<Customer> {
    const customer = await this.findByAuthUserForTenant(tenantId, authUserId);

    if (!customer || !isCustomerProfileComplete(customer)) {
      throw new BadRequestException(
        'Complete seu perfil antes de confirmar o agendamento.',
      );
    }

    return this.referralService.applyReferralLinkIfEligible(
      tenantId,
      customer,
      referralCode?.trim() || null,
    );
  }

  async searchForTenant(
    tenantId: string,
    query: string,
    limit = 8,
  ): Promise<CustomerListItem[]> {
    const trimmed = query.trim();

    if (trimmed.length < 3) {
      throw new BadRequestException(
        'Informe ao menos 3 caracteres para buscar clientes.',
      );
    }

    const escaped = trimmed.replace(/[\\%_]/g, '\\$&');
    const phoneDigits = trimmed.replace(/\D/g, '');
    const filters = [`name.ilike.%${escaped}%`];

    if (phoneDigits.length >= 3) {
      filters.push(`phone.ilike.%${phoneDigits}%`);
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('customers')
      .select('*')
      .eq('tenant_id', tenantId)
      .or(filters.join(','))
      .order('name', { ascending: true })
      .limit(limit);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = (data ?? []) as Customer[];

    return rows.map((row) => this.mapCustomerListItem(row, null));
  }

  async listForTenant(tenantId: string): Promise<CustomerListItem[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('customers')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = (data ?? []) as Customer[];
    const lastAppointmentByCustomer =
      await this.fetchLastAppointmentAtByCustomerIds(
        tenantId,
        rows.map((row) => row.id),
      );

    return rows.map((row) =>
      this.mapCustomerListItem(
        row,
        lastAppointmentByCustomer.get(row.id) ?? null,
      ),
    );
  }

  async findByIdForTenant(
    tenantId: string,
    customerId: string,
  ): Promise<Customer> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('customers')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', customerId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Cliente não encontrado.');
    }

    const customer = this.mapCustomerRow(data as Customer);
    const lastAppointmentByCustomer =
      await this.fetchLastAppointmentAtByCustomerIds(tenantId, [customerId]);

    return {
      ...customer,
      last_appointment_at: lastAppointmentByCustomer.get(customerId) ?? null,
    };
  }

  private async updateCustomerProfile(
    customer: Customer,
    params: {
      tenantId: string;
      authUserId?: string;
      name: string;
      phone: string;
      email: string | null;
      birthDate: string | null;
      instagramHandle: string | null;
      acquisitionSource: string | null;
      profilePictureUrl: string | null;
      referralCode: string | null;
    },
  ): Promise<Customer> {
    const withReferralCode = await this.referralService.ensureReferralCodeForCustomer(
      params.tenantId,
      customer,
    );

    const { data, error } = await this.supabaseService
      .getClient()
      .from('customers')
      .update({
        auth_user_id: params.authUserId ?? withReferralCode.auth_user_id,
        name: params.name,
        phone: params.phone,
        email: params.email,
        birth_date: params.birthDate,
        instagram_handle: params.instagramHandle,
        acquisition_source: params.acquisitionSource,
        profile_picture_url: params.profilePictureUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', withReferralCode.id)
      .eq('tenant_id', params.tenantId)
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const updated = this.mapCustomerRow(data as Customer);

    return this.referralService.applyReferralLinkIfEligible(
      params.tenantId,
      updated,
      params.referralCode,
    );
  }

  private async findByAuthUserForTenant(
    tenantId: string,
    authUserId: string,
  ): Promise<Customer | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('customers')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ? this.mapCustomerRow(data as Customer) : null;
  }

  private async findByPhoneForTenant(
    tenantId: string,
    phone: string,
  ): Promise<Customer | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('customers')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('phone', phone)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ? this.mapCustomerRow(data as Customer) : null;
  }

  private normalizeBirthDate(value?: string): string | null {
    const trimmed = value?.trim();

    if (!trimmed) {
      return null;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new BadRequestException(
        'A data de nascimento deve estar no formato AAAA-MM-DD.',
      );
    }

    return trimmed;
  }

  private mapCustomerRow(row: Customer): Customer {
    return {
      ...row,
      auth_user_id: row.auth_user_id ?? null,
      email: row.email ?? null,
      birth_date: row.birth_date ?? null,
      instagram_handle: row.instagram_handle ?? null,
      acquisition_source: row.acquisition_source ?? null,
      profile_picture_url: row.profile_picture_url ?? null,
      referral_code: row.referral_code ?? null,
      referred_by_id: row.referred_by_id ?? null,
      points_balance: Number(row.points_balance ?? 0),
    };
  }

  private async fetchLastAppointmentAtByCustomerIds(
    tenantId: string,
    customerIds: string[],
  ): Promise<Map<string, string>> {
    if (customerIds.length === 0) {
      return new Map();
    }

    const nowIso = new Date().toISOString();

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('customer_id, start_time')
      .eq('tenant_id', tenantId)
      .in('customer_id', customerIds)
      .lt('start_time', nowIso)
      .not('status', 'eq', 'CANCELLED');

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const lastAppointmentByCustomer = new Map<string, string>();

    for (const row of data ?? []) {
      const customerId = row.customer_id as string | undefined;
      const startTime = row.start_time as string | undefined;

      if (!customerId || !startTime) {
        continue;
      }

      const existing = lastAppointmentByCustomer.get(customerId);

      if (!existing || startTime > existing) {
        lastAppointmentByCustomer.set(customerId, startTime);
      }
    }

    return lastAppointmentByCustomer;
  }

  private mapCustomerListItem(
    row: Customer,
    lastAppointmentAt: string | null,
  ): CustomerListItem {
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      birthDate: row.birth_date,
      instagramHandle: row.instagram_handle,
      acquisitionSource: row.acquisition_source,
      profilePictureUrl: row.profile_picture_url,
      pointsBalance: Number(row.points_balance ?? 0),
      createdAt: row.created_at,
      lastAppointmentAt,
    };
  }
}
