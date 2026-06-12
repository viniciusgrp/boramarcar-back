import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import { ReferralService } from '../loyalty/referral.service';
import { normalizePhoneKey } from '../loyalty/utils/loyalty-points.util';
import { SupabaseService } from '../supabase/supabase.service';
import type { CompleteCustomerProfileDto } from './dto/complete-customer-profile.dto';
import type {
  Customer,
  CustomerListItem,
  CustomerMeResponse,
} from './entities/customer.entity';
import {
  isCustomerProfileComplete,
  normalizeAcquisitionSource,
  normalizeInstagramHandle,
  resolveOAuthAvatarUrl,
  resolveOAuthDisplayName,
} from './utils/customer-profile.util';

@Injectable()
export class CustomersService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly referralService: ReferralService,
  ) {}

  async getMe(authUserId: string, tenantId: string): Promise<CustomerMeResponse> {
    const customer = await this.findByAuthUserForTenant(tenantId, authUserId);

    return {
      customer,
      isProfileComplete: isCustomerProfileComplete(customer),
    };
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
    const displayName = resolveOAuthDisplayName(user);
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

    return (data ?? []).map((row) => this.mapCustomerListItem(row as Customer));
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

    return this.mapCustomerRow(data as Customer);
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

  private mapCustomerListItem(row: Customer): CustomerListItem {
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
    };
  }
}
