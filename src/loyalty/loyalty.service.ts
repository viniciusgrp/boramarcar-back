import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { subDays } from 'date-fns';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateLoyaltyRewardDto } from './dto/create-loyalty-reward.dto';
import { UpdateLoyaltyRewardDto } from './dto/update-loyalty-reward.dto';
import { UpdateLoyaltySettingsDto } from './dto/update-loyalty-settings.dto';
import type { BookingLoyaltyFeedback } from './entities/booking-loyalty-feedback.entity';
import type { Customer } from './entities/customer.entity';
import type { LoyaltyPublicProfile } from './entities/loyalty-public-profile.entity';
import type { LoyaltyReward } from './entities/loyalty-reward.entity';
import type { LoyaltySettings } from './entities/loyalty-settings.entity';
import type { LoyaltyTransaction } from './entities/loyalty-transaction.entity';
import {
  calculateAppointmentLoyaltyPoints,
  type AppointmentLoyaltyServiceLine,
} from '../services/utils/service-loyalty-points.util';
import {
  calculateEarnedPoints,
  normalizePhoneKey,
} from './utils/loyalty-points.util';
import { ReferralService } from './referral.service';

@Injectable()
export class LoyaltyService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly referralService: ReferralService,
  ) {}

  async getSettingsForTenant(tenantId: string): Promise<LoyaltySettings> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('loyalty_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      return this.buildDefaultSettings(tenantId);
    }

    return this.mapSettingsRow(data as LoyaltySettings);
  }

  async updateSettingsForTenant(
    tenantId: string,
    dto: UpdateLoyaltySettingsDto,
  ): Promise<LoyaltySettings> {
    this.validateSettingsPayload(dto);

    const payload = {
      tenant_id: tenantId,
      is_active: dto.isActive,
      points_per_currency: dto.pointsPerCurrency,
      expiration_days: dto.expirationDays ?? null,
      welcome_bonus: dto.welcomeBonus,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.supabaseService
      .getClient()
      .from('loyalty_settings')
      .upsert(payload, { onConflict: 'tenant_id' })
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return this.mapSettingsRow(data as LoyaltySettings);
  }

  async findRewardsManagedByTenant(tenantId: string): Promise<LoyaltyReward[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('loyalty_rewards')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('points_cost', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((row) => this.mapRewardRow(row as LoyaltyReward));
  }

  async createRewardForTenant(
    tenantId: string,
    dto: CreateLoyaltyRewardDto,
  ): Promise<LoyaltyReward> {
    const title = dto.title?.trim();

    if (!title) {
      throw new BadRequestException('Field "title" is required');
    }

    if (!dto.pointsCost || dto.pointsCost <= 0) {
      throw new BadRequestException('Field "pointsCost" must be greater than zero');
    }

    const serviceId = await this.resolveRewardServiceId(
      tenantId,
      dto.serviceId,
    );

    const { data, error } = await this.supabaseService
      .getClient()
      .from('loyalty_rewards')
      .insert({
        tenant_id: tenantId,
        title,
        points_cost: dto.pointsCost,
        service_id: serviceId,
        is_active: dto.isActive ?? true,
      })
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return this.mapRewardRow(data as LoyaltyReward);
  }

  async updateRewardForTenant(
    tenantId: string,
    rewardId: string,
    dto: UpdateLoyaltyRewardDto,
  ): Promise<LoyaltyReward> {
    await this.assertRewardBelongsToTenant(rewardId, tenantId);

    const payload: Record<string, string | number | boolean | null> = {
      updated_at: new Date().toISOString(),
    };

    if (dto.title !== undefined) {
      const title = dto.title.trim();

      if (!title) {
        throw new BadRequestException('Field "title" cannot be empty');
      }

      payload.title = title;
    }

    if (dto.pointsCost !== undefined) {
      if (dto.pointsCost <= 0) {
        throw new BadRequestException(
          'Field "pointsCost" must be greater than zero',
        );
      }

      payload.points_cost = dto.pointsCost;
    }

    if (dto.isActive !== undefined) {
      payload.is_active = dto.isActive;
    }

    if (dto.serviceId !== undefined) {
      payload.service_id = await this.resolveRewardServiceId(
        tenantId,
        dto.serviceId,
      );
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('loyalty_rewards')
      .update(payload)
      .eq('id', rewardId)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return this.mapRewardRow(data as LoyaltyReward);
  }

  async softDeleteRewardForTenant(
    tenantId: string,
    rewardId: string,
  ): Promise<LoyaltyReward> {
    return this.updateRewardForTenant(tenantId, rewardId, { isActive: false });
  }

  async buildBookingLoyaltyFeedback(
    tenantId: string,
    totalPrice: number,
    isNewCustomer: boolean,
  ): Promise<BookingLoyaltyFeedback> {
    const settings = await this.getSettingsForTenant(tenantId);

    if (!settings.is_active) {
      return {
        isActive: false,
        estimatedCompletionPoints: 0,
        welcomeBonusPoints: 0,
      };
    }

    const welcomeBonusPoints =
      isNewCustomer && settings.welcome_bonus > 0 ? settings.welcome_bonus : 0;

    return {
      isActive: true,
      estimatedCompletionPoints: calculateEarnedPoints(
        totalPrice,
        settings.points_per_currency,
      ),
      welcomeBonusPoints,
    };
  }

  async getBookingLoyaltyFeedbackByAppointmentId(
    appointmentId: string,
  ): Promise<BookingLoyaltyFeedback> {
    const { data: appointment, error: appointmentError } =
      await this.supabaseService
        .getClient()
        .from('appointments')
        .select('tenant_id, total_price, customer_id')
        .eq('id', appointmentId)
        .maybeSingle();

    if (appointmentError) {
      throw new InternalServerErrorException(appointmentError.message);
    }

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    const tenantId = appointment.tenant_id as string;
    const settings = await this.getSettingsForTenant(tenantId);

    if (!settings.is_active) {
      return {
        isActive: false,
        estimatedCompletionPoints: 0,
        welcomeBonusPoints: 0,
      };
    }

    const { data: tenant, error: tenantError } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select('name, slug')
      .eq('id', tenantId)
      .maybeSingle();

    if (tenantError) {
      throw new InternalServerErrorException(tenantError.message);
    }

    const welcomeBonusPoints = appointment.customer_id
      ? await this.resolveWelcomeBonusPointsForCustomer(
          tenantId,
          appointment.customer_id as string,
        )
      : 0;

    return {
      isActive: true,
      estimatedCompletionPoints: calculateEarnedPoints(
        Number(appointment.total_price ?? 0),
        settings.points_per_currency,
      ),
      welcomeBonusPoints,
      tenantSlug: tenant?.slug ?? undefined,
      tenantName: tenant?.name ?? undefined,
      customerReferralCode: appointment.customer_id
        ? await this.referralService.resolveCustomerReferralCodeForAppointment(
            tenantId,
            appointment.customer_id as string,
          )
        : null,
    };
  }

  async getPublicProfile(
    tenantId: string,
    phone: string,
  ): Promise<LoyaltyPublicProfile> {
    const settings = await this.getSettingsForTenant(tenantId);
    const customer = await this.findCustomerByPhone(tenantId, phone);

    const rewards = settings.is_active
      ? await this.findActiveRewardsByTenant(tenantId)
      : [];

    const recentTransactions = customer
      ? await this.findRecentTransactions(tenantId, customer.id)
      : [];

    return {
      isActive: settings.is_active,
      customer,
      rewards,
      recentTransactions,
    };
  }

  async validateRewardForAppointmentBooking(params: {
    tenantId: string;
    customerId: string;
    rewardId: string;
    serviceIds: string[];
  }): Promise<LoyaltyReward> {
    const settings = await this.getSettingsForTenant(params.tenantId);

    if (!settings.is_active) {
      throw new BadRequestException('Programa de fidelidade está desativado.');
    }

    const customer = await this.assertCustomerBelongsToTenant(
      params.customerId,
      params.tenantId,
    );
    const reward = await this.assertRewardBelongsToTenant(
      params.rewardId,
      params.tenantId,
    );

    if (!reward.is_active) {
      throw new BadRequestException('Esta recompensa não está disponível.');
    }

    if (customer.points_balance < reward.points_cost) {
      throw new BadRequestException('Saldo de pontos insuficiente.');
    }

    if (reward.service_id) {
      const matchesService = params.serviceIds.includes(reward.service_id);

      if (!matchesService) {
        throw new BadRequestException(
          'Esta recompensa não está vinculada aos serviços selecionados.',
        );
      }
    }

    return reward;
  }

  async redeemRewardForAppointment(params: {
    tenantId: string;
    customerId: string;
    rewardId: string;
    appointmentId: string;
  }): Promise<void> {
    const customer = await this.assertCustomerBelongsToTenant(
      params.customerId,
      params.tenantId,
    );
    const reward = await this.assertRewardBelongsToTenant(
      params.rewardId,
      params.tenantId,
    );

    if (customer.points_balance < reward.points_cost) {
      throw new BadRequestException('Saldo de pontos insuficiente.');
    }

    const newBalance = customer.points_balance - reward.points_cost;

    const { error: updateError } = await this.supabaseService
      .getClient()
      .from('customers')
      .update({
        points_balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.customerId)
      .eq('tenant_id', params.tenantId);

    if (updateError) {
      throw new InternalServerErrorException(updateError.message);
    }

    await this.insertTransaction({
      tenantId: params.tenantId,
      customerId: params.customerId,
      type: 'REDEEMED',
      points: reward.points_cost,
      description: `Resgate no agendamento: ${reward.title}`,
      appointmentId: params.appointmentId,
    });
  }

  async redeemReward(
    tenantId: string,
    customerId: string,
    rewardId: string,
  ): Promise<{ customer: Customer; transaction: LoyaltyTransaction }> {
    const settings = await this.getSettingsForTenant(tenantId);

    if (!settings.is_active) {
      throw new BadRequestException('Programa de fidelidade está desativado.');
    }

    const customer = await this.assertCustomerBelongsToTenant(customerId, tenantId);
    const reward = await this.assertRewardBelongsToTenant(rewardId, tenantId);

    if (!reward.is_active) {
      throw new BadRequestException('Esta recompensa não está disponível.');
    }

    if (customer.points_balance < reward.points_cost) {
      throw new BadRequestException('Saldo de pontos insuficiente.');
    }

    const newBalance = customer.points_balance - reward.points_cost;

    const { error: updateError } = await this.supabaseService
      .getClient()
      .from('customers')
      .update({
        points_balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customerId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      throw new InternalServerErrorException(updateError.message);
    }

    const transaction = await this.insertTransaction({
      tenantId,
      customerId,
      type: 'REDEEMED',
      points: reward.points_cost,
      description: `Resgate: ${reward.title}`,
    });

    const updatedCustomer = await this.assertCustomerBelongsToTenant(
      customerId,
      tenantId,
    );

    return { customer: updatedCustomer, transaction };
  }

  async findOrCreateCustomerForAppointment(
    tenantId: string,
    name: string,
    phone: string,
    referralCode?: string | null,
  ): Promise<{ customer: Customer; isNew: boolean }> {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const phoneKey = normalizePhoneKey(trimmedPhone);

    if (!trimmedName || !phoneKey) {
      throw new BadRequestException('Customer name and phone are required');
    }

    const existing = await this.findCustomerByPhone(tenantId, trimmedPhone);

    if (existing) {
      if (existing.name !== trimmedName) {
        const { data, error } = await this.supabaseService
          .getClient()
          .from('customers')
          .update({
            name: trimmedName,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .eq('tenant_id', tenantId)
          .select('*')
          .single();

        if (error) {
          throw new InternalServerErrorException(error.message);
        }

        return {
          customer: await this.finalizeCustomerReferralState(
            tenantId,
            this.mapCustomerRow(data as Customer),
            referralCode,
          ),
          isNew: false,
        };
      }

      return {
        customer: await this.finalizeCustomerReferralState(
          tenantId,
          existing,
          referralCode,
        ),
        isNew: false,
      };
    }

    const newReferralCode =
      await this.referralService.generateReferralCodeForNewCustomer();

    const { data, error } = await this.supabaseService
      .getClient()
      .from('customers')
      .insert({
        tenant_id: tenantId,
        name: trimmedName,
        phone: trimmedPhone,
        points_balance: 0,
        referral_code: newReferralCode,
      })
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const customer = this.mapCustomerRow(data as Customer);

    await this.applyWelcomeBonusIfEligible(tenantId, customer.id);

    const refreshed = await this.assertCustomerBelongsToTenant(
      customer.id,
      tenantId,
    );

    const finalizedCustomer = await this.finalizeCustomerReferralState(
      tenantId,
      refreshed,
      referralCode,
    );

    return { customer: finalizedCustomer, isNew: true };
  }

  async awardReferralBonusesForFirstCompletedAppointment(params: {
    tenantId: string;
    appointmentId: string;
    customerId: string;
  }): Promise<void> {
    return this.referralService.awardReferralBonusesForFirstCompletedAppointment(
      params,
    );
  }

  private async finalizeCustomerReferralState(
    tenantId: string,
    customer: Customer,
    referralCode?: string | null,
  ): Promise<Customer> {
    const withReferralCode = await this.referralService.ensureReferralCodeForCustomer(
      tenantId,
      customer,
    );

    return this.referralService.applyReferralLinkIfEligible(
      tenantId,
      withReferralCode,
      referralCode,
    );
  }

  async awardPointsForCompletedAppointment(params: {
    tenantId: string;
    appointmentId: string;
    customerId: string | null;
    customerName: string;
    customerPhone: string;
    totalPrice: number;
    serviceLines?: AppointmentLoyaltyServiceLine[];
  }): Promise<void> {
    const settings = await this.getSettingsForTenant(params.tenantId);

    if (!settings.is_active) {
      return;
    }

    let customerId = params.customerId;

    if (!customerId) {
      const resolved = await this.findOrCreateCustomerForAppointment(
        params.tenantId,
        params.customerName,
        params.customerPhone,
      );
      customerId = resolved.customer.id;
    }

    const earnedPoints = params.serviceLines?.length
      ? calculateAppointmentLoyaltyPoints(
          params.serviceLines,
          settings.points_per_currency,
        )
      : calculateEarnedPoints(
          params.totalPrice,
          settings.points_per_currency,
        );

    if (earnedPoints <= 0) {
      return;
    }

    const customer = await this.assertCustomerBelongsToTenant(
      customerId,
      params.tenantId,
    );

    const { error: updateError } = await this.supabaseService
      .getClient()
      .from('customers')
      .update({
        points_balance: customer.points_balance + earnedPoints,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customerId)
      .eq('tenant_id', params.tenantId);

    if (updateError) {
      throw new InternalServerErrorException(updateError.message);
    }

    await this.insertTransaction({
      tenantId: params.tenantId,
      customerId,
      type: 'EARNED',
      points: earnedPoints,
      description: `Pontos pelo atendimento concluído`,
      appointmentId: params.appointmentId,
    });
  }

  async reverseEarnedPointsForCompletedAppointment(params: {
    tenantId: string;
    appointmentId: string;
  }): Promise<void> {
    const { data: transactions, error } = await this.supabaseService
      .getClient()
      .from('loyalty_transactions')
      .select('customer_id, points')
      .eq('tenant_id', params.tenantId)
      .eq('appointment_id', params.appointmentId)
      .eq('type', 'EARNED');

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const earnedRows = transactions ?? [];

    if (earnedRows.length === 0) {
      return;
    }

    const pointsByCustomer = new Map<string, number>();

    for (const row of earnedRows) {
      const customerId = row.customer_id as string;
      const points = Number(row.points ?? 0);

      if (!customerId || points <= 0) {
        continue;
      }

      pointsByCustomer.set(
        customerId,
        (pointsByCustomer.get(customerId) ?? 0) + points,
      );
    }

    for (const [customerId, pointsToReverse] of pointsByCustomer) {
      const customer = await this.assertCustomerBelongsToTenant(
        customerId,
        params.tenantId,
      );

      const { error: updateError } = await this.supabaseService
        .getClient()
        .from('customers')
        .update({
          points_balance: Math.max(0, customer.points_balance - pointsToReverse),
          updated_at: new Date().toISOString(),
        })
        .eq('id', customerId)
        .eq('tenant_id', params.tenantId);

      if (updateError) {
        throw new InternalServerErrorException(updateError.message);
      }

      await this.insertTransaction({
        tenantId: params.tenantId,
        customerId,
        type: 'REDEEMED',
        points: pointsToReverse,
        description: 'Estorno — conclusão revertida',
        appointmentId: params.appointmentId,
      });
    }
  }

  async expirePointsForAllTenants(): Promise<void> {
    const { data: settingsRows, error } = await this.supabaseService
      .getClient()
      .from('loyalty_settings')
      .select('tenant_id, expiration_days')
      .eq('is_active', true)
      .not('expiration_days', 'is', null);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    for (const settings of settingsRows ?? []) {
      const tenantId = settings.tenant_id as string;
      const expirationDays = Number(settings.expiration_days);

      if (!expirationDays || expirationDays <= 0) {
        continue;
      }

      await this.expirePointsForTenant(tenantId, expirationDays);
    }
  }

  private async expirePointsForTenant(
    tenantId: string,
    expirationDays: number,
  ): Promise<void> {
    const cutoffIso = subDays(new Date(), expirationDays).toISOString();

    const { data: earnedRows, error } = await this.supabaseService
      .getClient()
      .from('loyalty_transactions')
      .select('id, customer_id, points')
      .eq('tenant_id', tenantId)
      .eq('type', 'EARNED')
      .lte('created_at', cutoffIso);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const grouped = new Map<string, number>();

    for (const row of earnedRows ?? []) {
      const customerId = row.customer_id as string;
      const points = Number(row.points ?? 0);
      grouped.set(customerId, (grouped.get(customerId) ?? 0) + points);
    }

    for (const [customerId, stalePoints] of grouped.entries()) {
      const customer = await this.assertCustomerBelongsToTenant(
        customerId,
        tenantId,
      );

      if (customer.points_balance <= 0 || stalePoints <= 0) {
        continue;
      }

      const pointsToExpire = Math.min(customer.points_balance, stalePoints);
      const newBalance = customer.points_balance - pointsToExpire;

      const { error: updateError } = await this.supabaseService
        .getClient()
        .from('customers')
        .update({
          points_balance: newBalance,
          updated_at: new Date().toISOString(),
        })
        .eq('id', customerId)
        .eq('tenant_id', tenantId);

      if (updateError) {
        throw new InternalServerErrorException(updateError.message);
      }

      await this.insertTransaction({
        tenantId,
        customerId,
        type: 'EXPIRED',
        points: pointsToExpire,
        description: `Pontos expirados após ${expirationDays} dias`,
      });
    }
  }

  private async applyWelcomeBonusIfEligible(
    tenantId: string,
    customerId: string,
  ): Promise<void> {
    const settings = await this.getSettingsForTenant(tenantId);

    if (!settings.is_active || settings.welcome_bonus <= 0) {
      return;
    }

    const customer = await this.assertCustomerBelongsToTenant(customerId, tenantId);

    const { error: updateError } = await this.supabaseService
      .getClient()
      .from('customers')
      .update({
        points_balance: customer.points_balance + settings.welcome_bonus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customerId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      throw new InternalServerErrorException(updateError.message);
    }

    await this.insertTransaction({
      tenantId,
      customerId,
      type: 'EARNED',
      points: settings.welcome_bonus,
      description: 'Bônus de cadastro',
    });
  }

  private async insertTransaction(params: {
    tenantId: string;
    customerId: string;
    type: 'EARNED' | 'REDEEMED' | 'EXPIRED';
    points: number;
    description: string;
    appointmentId?: string;
  }): Promise<LoyaltyTransaction> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('loyalty_transactions')
      .insert({
        tenant_id: params.tenantId,
        customer_id: params.customerId,
        type: params.type,
        points: params.points,
        description: params.description,
        appointment_id: params.appointmentId ?? null,
      })
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return this.mapTransactionRow(data as LoyaltyTransaction);
  }

  private async resolveWelcomeBonusPointsForCustomer(
    tenantId: string,
    customerId: string,
  ): Promise<number> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('loyalty_transactions')
      .select('points')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .eq('type', 'EARNED')
      .eq('description', 'Bônus de cadastro')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ? Number(data.points ?? 0) : 0;
  }

  private async findCustomerByPhone(
    tenantId: string,
    phone: string,
  ): Promise<Customer | null> {
    const phoneKey = normalizePhoneKey(phone);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('customers')
      .select('*')
      .eq('tenant_id', tenantId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = (data ?? []) as Customer[];
    const match = rows.find(
      (row) => normalizePhoneKey(row.phone) === phoneKey,
    );

    return match ? this.mapCustomerRow(match) : null;
  }

  private async findActiveRewardsByTenant(
    tenantId: string,
  ): Promise<LoyaltyReward[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('loyalty_rewards')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('points_cost', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((row) => this.mapRewardRow(row as LoyaltyReward));
  }

  private async findRecentTransactions(
    tenantId: string,
    customerId: string,
  ): Promise<LoyaltyTransaction[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('loyalty_transactions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((row) =>
      this.mapTransactionRow(row as LoyaltyTransaction),
    );
  }

  private async assertCustomerBelongsToTenant(
    customerId: string,
    tenantId: string,
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
      throw new NotFoundException('Customer not found for this tenant');
    }

    return this.mapCustomerRow(data as Customer);
  }

  private async assertRewardBelongsToTenant(
    rewardId: string,
    tenantId: string,
  ): Promise<LoyaltyReward> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('loyalty_rewards')
      .select('*')
      .eq('id', rewardId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Reward not found for this tenant');
    }

    return this.mapRewardRow(data as LoyaltyReward);
  }

  private async resolveRewardServiceId(
    tenantId: string,
    serviceId?: string | null,
  ): Promise<string | null> {
    if (serviceId === undefined || serviceId === null || serviceId === '') {
      return null;
    }

    const trimmedId = serviceId.trim();

    const { data, error } = await this.supabaseService
      .getClient()
      .from('services')
      .select('id')
      .eq('id', trimmedId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new BadRequestException(
        'O serviço selecionado não foi encontrado ou está inativo.',
      );
    }

    return trimmedId;
  }

  private validateSettingsPayload(dto: UpdateLoyaltySettingsDto): void {
    if (dto.pointsPerCurrency <= 0) {
      throw new BadRequestException(
        'Field "pointsPerCurrency" must be greater than zero',
      );
    }

    if (dto.welcomeBonus < 0) {
      throw new BadRequestException(
        'Field "welcomeBonus" cannot be negative',
      );
    }

    if (
      dto.expirationDays !== undefined &&
      dto.expirationDays !== null &&
      dto.expirationDays <= 0
    ) {
      throw new BadRequestException(
        'Field "expirationDays" must be greater than zero when provided',
      );
    }
  }

  private buildDefaultSettings(tenantId: string): LoyaltySettings {
    return {
      tenant_id: tenantId,
      is_active: false,
      points_per_currency: 1,
      expiration_days: null,
      welcome_bonus: 0,
      updated_at: new Date().toISOString(),
    };
  }

  private mapSettingsRow(row: LoyaltySettings): LoyaltySettings {
    return {
      ...row,
      points_per_currency: Number(row.points_per_currency),
      expiration_days:
        row.expiration_days === null || row.expiration_days === undefined
          ? null
          : Number(row.expiration_days),
      welcome_bonus: Number(row.welcome_bonus ?? 0),
    };
  }

  private mapRewardRow(row: LoyaltyReward): LoyaltyReward {
    return {
      ...row,
      points_cost: Number(row.points_cost),
      service_id: row.service_id ?? null,
    };
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

  private mapTransactionRow(row: LoyaltyTransaction): LoyaltyTransaction {
    return {
      ...row,
      points: Number(row.points),
    };
  }
}
