import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { SupabaseService } from '../supabase/supabase.service';
import type { Customer } from './entities/customer.entity';
import {
  REFERRAL_REFEREE_BONUS_DESCRIPTION,
  REFERRAL_REFERRER_BONUS_DESCRIPTION,
} from './utils/referral.constants';
import {
  generateRandomReferralCodeLength,
  generateReferralCode,
  normalizeReferralCode,
} from './utils/referral-code.util';

interface TenantReferralSettings {
  enable_referral_program: boolean;
  referrer_points_bonus: number;
  referee_points_bonus: number;
  name: string;
}

@Injectable()
export class ReferralService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly mailService: MailService,
  ) {}

  async generateReferralCodeForNewCustomer(): Promise<string> {
    return this.generateUniqueReferralCode();
  }

  async ensureReferralCodeForCustomer(
    tenantId: string,
    customer: Customer,
  ): Promise<Customer> {
    if (customer.referral_code) {
      return customer;
    }

    const referralCode = await this.generateUniqueReferralCode();

    const { data, error } = await this.supabaseService
      .getClient()
      .from('customers')
      .update({
        referral_code: referralCode,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customer.id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return this.mapCustomerRow(data as Customer);
  }

  async applyReferralLinkIfEligible(
    tenantId: string,
    customer: Customer,
    referralCode?: string | null,
  ): Promise<Customer> {
    const normalizedCode = normalizeReferralCode(referralCode);

    if (!normalizedCode || customer.referred_by_id) {
      return customer;
    }

    const referrer = await this.findCustomerByReferralCode(
      tenantId,
      normalizedCode,
    );

    if (!referrer || referrer.id === customer.id) {
      return customer;
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('customers')
      .update({
        referred_by_id: referrer.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customer.id)
      .eq('tenant_id', tenantId)
      .is('referred_by_id', null)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      return customer;
    }

    return this.mapCustomerRow(data as Customer);
  }

  async awardReferralBonusesForFirstCompletedAppointment(params: {
    tenantId: string;
    appointmentId: string;
    customerId: string;
  }): Promise<void> {
    const tenantSettings = await this.loadTenantReferralSettings(params.tenantId);

    if (!tenantSettings.enable_referral_program) {
      return;
    }

    const customer = await this.loadCustomer(
      params.tenantId,
      params.customerId,
    );

    if (!customer.referred_by_id) {
      return;
    }

    const completedCount = await this.countCompletedAppointmentsForCustomer(
      params.tenantId,
      params.customerId,
    );

    if (completedCount !== 1) {
      return;
    }

    const referrer = await this.loadCustomer(
      params.tenantId,
      customer.referred_by_id,
    );

    const referrerBonus = tenantSettings.referrer_points_bonus;
    const refereeBonus = tenantSettings.referee_points_bonus;

    if (referrerBonus > 0) {
      const alreadyAwarded = await this.hasReferralBonusTransaction(
        params.tenantId,
        referrer.id,
        REFERRAL_REFERRER_BONUS_DESCRIPTION,
        params.appointmentId,
      );

      if (!alreadyAwarded) {
        await this.creditReferralPoints({
          tenantId: params.tenantId,
          customerId: referrer.id,
          points: referrerBonus,
          description: REFERRAL_REFERRER_BONUS_DESCRIPTION,
          appointmentId: params.appointmentId,
        });

        void this.mailService
          .sendReferralBonusEarned({
            recipientEmail: referrer.email,
            recipientName: referrer.name,
            points: referrerBonus,
            tenantName: tenantSettings.name,
            role: 'referrer',
          })
          .catch(() => undefined);
      }
    }

    if (refereeBonus > 0) {
      const alreadyAwarded = await this.hasReferralBonusTransaction(
        params.tenantId,
        customer.id,
        REFERRAL_REFEREE_BONUS_DESCRIPTION,
        params.appointmentId,
      );

      if (!alreadyAwarded) {
        await this.creditReferralPoints({
          tenantId: params.tenantId,
          customerId: customer.id,
          points: refereeBonus,
          description: REFERRAL_REFEREE_BONUS_DESCRIPTION,
          appointmentId: params.appointmentId,
        });

        void this.mailService
          .sendReferralBonusEarned({
            recipientEmail: customer.email,
            recipientName: customer.name,
            points: refereeBonus,
            tenantName: tenantSettings.name,
            role: 'referee',
          })
          .catch(() => undefined);
      }
    }
  }

  async resolveCustomerReferralCodeForAppointment(
    tenantId: string,
    customerId: string,
  ): Promise<string | null> {
    const tenantSettings = await this.loadTenantReferralSettings(tenantId);

    if (!tenantSettings.enable_referral_program) {
      return null;
    }

    const customer = await this.loadCustomer(tenantId, customerId);
    const withCode = await this.ensureReferralCodeForCustomer(tenantId, customer);

    return withCode.referral_code;
  }

  private async creditReferralPoints(params: {
    tenantId: string;
    customerId: string;
    points: number;
    description: string;
    appointmentId: string;
  }): Promise<void> {
    const customer = await this.loadCustomer(params.tenantId, params.customerId);

    const { error: updateError } = await this.supabaseService
      .getClient()
      .from('customers')
      .update({
        points_balance: customer.points_balance + params.points,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.customerId)
      .eq('tenant_id', params.tenantId);

    if (updateError) {
      throw new InternalServerErrorException(updateError.message);
    }

    const { error: insertError } = await this.supabaseService
      .getClient()
      .from('loyalty_transactions')
      .insert({
        tenant_id: params.tenantId,
        customer_id: params.customerId,
        type: 'EARNED',
        points: params.points,
        description: params.description,
        appointment_id: params.appointmentId,
      });

    if (insertError) {
      throw new InternalServerErrorException(insertError.message);
    }
  }

  private async hasReferralBonusTransaction(
    tenantId: string,
    customerId: string,
    description: string,
    appointmentId: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('loyalty_transactions')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .eq('description', description)
      .eq('appointment_id', appointmentId)
      .limit(1);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return Boolean(data && data.length > 0);
  }

  private async countCompletedAppointmentsForCustomer(
    tenantId: string,
    customerId: string,
  ): Promise<number> {
    const { count, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .eq('status', 'COMPLETED');

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return count ?? 0;
  }

  private async findCustomerByReferralCode(
    tenantId: string,
    referralCode: string,
  ): Promise<Customer | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('customers')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('referral_code', referralCode)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ? this.mapCustomerRow(data as Customer) : null;
  }

  private async generateUniqueReferralCode(): Promise<string> {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidate = generateReferralCode(generateRandomReferralCodeLength());

      const { data, error } = await this.supabaseService
        .getClient()
        .from('customers')
        .select('id')
        .eq('referral_code', candidate)
        .limit(1);

      if (error) {
        throw new InternalServerErrorException(error.message);
      }

      if (!data || data.length === 0) {
        return candidate;
      }
    }

    throw new InternalServerErrorException(
      'Não foi possível gerar um código de indicação único.',
    );
  }

  private async loadTenantReferralSettings(
    tenantId: string,
  ): Promise<TenantReferralSettings> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select(
        'enable_referral_program, referrer_points_bonus, referee_points_bonus, name',
      )
      .eq('id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new InternalServerErrorException('Estabelecimento não encontrado.');
    }

    return {
      enable_referral_program: Boolean(data.enable_referral_program),
      referrer_points_bonus: Number(data.referrer_points_bonus ?? 0),
      referee_points_bonus: Number(data.referee_points_bonus ?? 0),
      name: (data.name as string)?.trim() || 'Estabelecimento',
    };
  }

  private async loadCustomer(
    tenantId: string,
    customerId: string,
  ): Promise<Customer> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new InternalServerErrorException('Cliente não encontrado.');
    }

    return this.mapCustomerRow(data as Customer);
  }

  private mapCustomerRow(row: Customer): Customer {
    return {
      ...row,
      email: row.email ?? null,
      referral_code: row.referral_code ?? null,
      referred_by_id: row.referred_by_id ?? null,
      points_balance: Number(row.points_balance ?? 0),
    };
  }
}
