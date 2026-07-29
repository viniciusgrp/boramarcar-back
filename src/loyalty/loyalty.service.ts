import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { subDays } from 'date-fns';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateLoyaltyRewardDto } from './dto/create-loyalty-reward.dto';
import { UpdateLoyaltyRewardDto } from './dto/update-loyalty-reward.dto';
import { UpdateLoyaltySettingsDto } from './dto/update-loyalty-settings.dto';
import type { BookingLoyaltyFeedback } from './entities/booking-loyalty-feedback.entity';
import type { Customer } from './entities/customer.entity';
import type { LoyaltyPublicProfile } from './entities/loyalty-public-profile.entity';
import type { LoyaltyRedemptionHistoryItem } from './entities/loyalty-redemption-history.entity';
import type { LoyaltyReward } from './entities/loyalty-reward.entity';
import type { LoyaltySettings } from './entities/loyalty-settings.entity';
import type { LoyaltyTransaction } from './entities/loyalty-transaction.entity';
import {
  calculateAppointmentLoyaltyPoints,
  type AppointmentLoyaltyServiceLine,
} from '../services/utils/service-loyalty-points.util';
import { computePointsToExpire } from './utils/loyalty-expiration.util';
import {
  buildBookingRedeemDescription,
  buildExpirationDescription,
  buildStandaloneRedeemDescription,
  isBookingRedeemDescription,
  isCompletionEarnDescription,
  isCompletionReverseDescription,
  isRedeemRefundDescription,
  isRewardRedeemDescription,
  LOYALTY_COMPLETION_EARN_DESCRIPTION,
  LOYALTY_COMPLETION_REVERSE_DESCRIPTION,
  LOYALTY_REFUND_REDEEM_DESCRIPTION,
  LOYALTY_RESTORE_REDEEM_DESCRIPTION,
  LOYALTY_WELCOME_BONUS_DESCRIPTION,
} from './utils/loyalty-ledger.constants';
import {
  calculateEarnedPoints,
  normalizePhoneKey,
} from './utils/loyalty-points.util';
import {
  parseRewardTitleFromRedemptionDescription,
  resolveRedemptionSource,
} from './utils/loyalty-redemption-description.util';
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
      default_service_points: dto.defaultServicePoints ?? 0,
      expiration_days: dto.expirationDays ?? null,
      welcome_bonus: dto.welcomeBonus,
      refund_points_on_no_show: dto.refundPointsOnNoShow ?? false,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.supabaseService
      .getClient()
      .from('loyalty_settings')
      .upsert(payload, { onConflict: 'tenant_id' })
      .select('*')
      .single();

    if (error) {
      if (error.message.includes('loyalty_settings_points_per_currency_check')) {
        throw new BadRequestException(
          'A regra por valor deve ser maior que zero. Para pontuar por serviço, selecione o modo "Por serviço".',
        );
      }

      if (error.message.includes('default_service_points')) {
        throw new BadRequestException(
          'Os pontos padrão por serviço devem ser maiores ou iguais a zero.',
        );
      }

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

  async findRedemptionHistoryForTenant(
    tenantId: string,
  ): Promise<LoyaltyRedemptionHistoryItem[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('loyalty_transactions')
      .select(
        `
        id,
        customer_id,
        points,
        description,
        appointment_id,
        created_at,
        customers ( name, phone ),
        appointments ( start_time )
      `,
      )
      .eq('tenant_id', tenantId)
      .eq('type', 'REDEEMED')
      .ilike('description', 'Resgate%')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((row) =>
      this.mapRedemptionHistoryRow(
        row as Parameters<typeof this.mapRedemptionHistoryRow>[0],
      ),
    );
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

  resolveCustomerReferralCodeForAppointment(
    tenantId: string,
    customerId: string,
  ): Promise<string | null> {
    return this.referralService.resolveCustomerReferralCodeForAppointment(
      tenantId,
      customerId,
    );
  }

  async getBookingLoyaltyFeedbackByAppointmentId(
    appointmentId: string,
    accessToken: string,
  ): Promise<BookingLoyaltyFeedback> {
    const { data: appointment, error: appointmentError } =
      await this.supabaseService
        .getClient()
        .from('appointments')
        .select('tenant_id, total_price, customer_id, guest_access_token')
        .eq('id', appointmentId)
        .maybeSingle();

    if (appointmentError) {
      throw new InternalServerErrorException(appointmentError.message);
    }

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    const expected =
      typeof appointment.guest_access_token === 'string'
        ? appointment.guest_access_token.trim()
        : '';
    const provided = accessToken.trim();

    if (
      !expected ||
      expected.length !== provided.length ||
      !timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(provided, 'utf8'))
    ) {
      throw new ForbiddenException(
        'Token de acesso inválido para este agendamento.',
      );
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
    void phone;
    void tenantId;
    throw new ForbiddenException(
      'Consulta de fidelidade por telefone não está disponível. Entre com sua conta ou peça ao estabelecimento.',
    );
  }

  async getPublicProfileByCustomerId(
    tenantId: string,
    customerId: string,
  ): Promise<LoyaltyPublicProfile> {
    const customer = await this.assertCustomerBelongsToTenant(
      customerId,
      tenantId,
    );
    return this.buildPublicProfile(tenantId, customer);
  }

  async getProfileForAuthCustomer(
    tenantId: string,
    authUserId: string,
  ): Promise<LoyaltyPublicProfile> {
    const customer = await this.findCustomerByAuthUser(tenantId, authUserId);
    return this.buildPublicProfile(tenantId, customer);
  }

  private async buildPublicProfile(
    tenantId: string,
    customer: Customer | null,
  ): Promise<LoyaltyPublicProfile> {
    const settings = await this.getSettingsForTenant(tenantId);

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
    const settings = await this.getSettingsForTenant(params.tenantId);

    if (!settings.is_active) {
      throw new BadRequestException('Programa de fidelidade está desativado.');
    }

    await this.assertCustomerBelongsToTenant(
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

    await this.debitCustomerPointsAtomic({
      tenantId: params.tenantId,
      customerId: params.customerId,
      points: reward.points_cost,
    });

    await this.insertTransaction({
      tenantId: params.tenantId,
      customerId: params.customerId,
      type: 'REDEEMED',
      points: reward.points_cost,
      description: buildBookingRedeemDescription(reward.title),
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

    await this.assertCustomerBelongsToTenant(customerId, tenantId);
    const reward = await this.assertRewardBelongsToTenant(rewardId, tenantId);

    if (!reward.is_active) {
      throw new BadRequestException('Esta recompensa não está disponível.');
    }

    await this.debitCustomerPointsAtomic({
      tenantId,
      customerId,
      points: reward.points_cost,
    });

    const transaction = await this.insertTransaction({
      tenantId,
      customerId,
      type: 'REDEEMED',
      points: reward.points_cost,
      description: buildStandaloneRedeemDescription(reward.title),
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
      const shouldNormalizePhone = existing.phone !== phoneKey;
      const shouldRename = existing.name !== trimmedName;

      if (shouldRename || shouldNormalizePhone) {
        const { data, error } = await this.supabaseService
          .getClient()
          .from('customers')
          .update({
            name: trimmedName,
            phone: phoneKey,
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
        phone: phoneKey,
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

    const alreadyAwarded = await this.hasCompletionEarnForAppointment(
      params.tenantId,
      params.appointmentId,
    );

    if (alreadyAwarded) {
      return;
    }

    const earnedPoints = params.serviceLines?.length
      ? calculateAppointmentLoyaltyPoints(
          params.serviceLines,
          settings.points_per_currency,
          settings.default_service_points,
        )
      : calculateEarnedPoints(
          params.totalPrice,
          settings.points_per_currency,
        );

    if (earnedPoints <= 0) {
      return;
    }

    await this.assertCustomerBelongsToTenant(customerId, params.tenantId);

    await this.creditCustomerPointsAtomic({
      tenantId: params.tenantId,
      customerId,
      points: earnedPoints,
    });

    await this.insertTransaction({
      tenantId: params.tenantId,
      customerId,
      type: 'EARNED',
      points: earnedPoints,
      description: LOYALTY_COMPLETION_EARN_DESCRIPTION,
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
      .select('customer_id, points, type, description')
      .eq('tenant_id', params.tenantId)
      .eq('appointment_id', params.appointmentId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const pointsByCustomer = new Map<string, number>();

    for (const row of transactions ?? []) {
      const customerId = row.customer_id as string;
      const points = Number(row.points ?? 0);
      const description = String(row.description ?? '');

      if (!customerId || points <= 0) {
        continue;
      }

      if (
        row.type === 'EARNED' &&
        isCompletionEarnDescription(description)
      ) {
        pointsByCustomer.set(
          customerId,
          (pointsByCustomer.get(customerId) ?? 0) + points,
        );
      }

      if (
        row.type === 'REDEEMED' &&
        isCompletionReverseDescription(description)
      ) {
        pointsByCustomer.set(
          customerId,
          (pointsByCustomer.get(customerId) ?? 0) - points,
        );
      }
    }

    for (const [customerId, netPointsToReverse] of pointsByCustomer) {
      if (netPointsToReverse <= 0) {
        continue;
      }

      const debited = await this.debitCustomerPointsAtomic({
        tenantId: params.tenantId,
        customerId,
        points: netPointsToReverse,
        allowPartialClamp: true,
      });

      if (debited <= 0) {
        continue;
      }

      await this.insertTransaction({
        tenantId: params.tenantId,
        customerId,
        type: 'REDEEMED',
        points: debited,
        description: LOYALTY_COMPLETION_REVERSE_DESCRIPTION,
        appointmentId: params.appointmentId,
      });
    }
  }

  async refundRedeemedPointsForAppointment(params: {
    tenantId: string;
    appointmentId: string;
  }): Promise<void> {
    const state = await this.getAppointmentRedemptionState(
      params.tenantId,
      params.appointmentId,
    );

    if (!state || state.netChargedPoints <= 0) {
      return;
    }

    await this.assertCustomerBelongsToTenant(
      state.customerId,
      params.tenantId,
    );

    await this.creditCustomerPointsAtomic({
      tenantId: params.tenantId,
      customerId: state.customerId,
      points: state.netChargedPoints,
    });

    await this.insertTransaction({
      tenantId: params.tenantId,
      customerId: state.customerId,
      type: 'EARNED',
      points: state.netChargedPoints,
      description: LOYALTY_REFUND_REDEEM_DESCRIPTION,
      appointmentId: params.appointmentId,
    });
  }

  async restoreRedeemedPointsForAppointment(params: {
    tenantId: string;
    appointmentId: string;
  }): Promise<void> {
    const state = await this.getAppointmentRedemptionState(
      params.tenantId,
      params.appointmentId,
    );

    if (!state || state.baseRedeemedPoints <= 0 || state.netChargedPoints > 0) {
      return;
    }

    await this.assertCustomerBelongsToTenant(
      state.customerId,
      params.tenantId,
    );

    await this.debitCustomerPointsAtomic({
      tenantId: params.tenantId,
      customerId: state.customerId,
      points: state.baseRedeemedPoints,
    });

    await this.insertTransaction({
      tenantId: params.tenantId,
      customerId: state.customerId,
      type: 'REDEEMED',
      points: state.baseRedeemedPoints,
      description: LOYALTY_RESTORE_REDEEM_DESCRIPTION,
      appointmentId: params.appointmentId,
    });
  }

  private async getAppointmentRedemptionState(
    tenantId: string,
    appointmentId: string,
  ): Promise<{
    customerId: string;
    baseRedeemedPoints: number;
    netChargedPoints: number;
  } | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('loyalty_transactions')
      .select('customer_id, points, type, description')
      .eq('tenant_id', tenantId)
      .eq('appointment_id', appointmentId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = (data ?? []) as {
      customer_id: string | null;
      points: number | string;
      type: string;
      description: string | null;
    }[];

    let customerId: string | null = null;
    let baseRedeemedPoints = 0;
    let redeemedPoints = 0;
    let refundedPoints = 0;

    for (const row of rows) {
      const points = Number(row.points ?? 0);
      const description = row.description ?? '';

      if (row.type === 'REDEEMED' && isRewardRedeemDescription(description)) {
        redeemedPoints += points;
        customerId = customerId ?? row.customer_id;

        if (isBookingRedeemDescription(description)) {
          baseRedeemedPoints += points;
        }
      }

      if (row.type === 'EARNED' && isRedeemRefundDescription(description)) {
        refundedPoints += points;
      }
    }

    if (!customerId || redeemedPoints <= 0) {
      return null;
    }

    return {
      customerId,
      baseRedeemedPoints,
      netChargedPoints: redeemedPoints - refundedPoints,
    };
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

    const { data: customerRows, error: customersError } =
      await this.supabaseService
        .getClient()
        .from('customers')
        .select('id, points_balance')
        .eq('tenant_id', tenantId)
        .gt('points_balance', 0);

    if (customersError) {
      throw new InternalServerErrorException(customersError.message);
    }

    for (const customerRow of customerRows ?? []) {
      const customerId = customerRow.id as string;
      const currentBalance = Number(customerRow.points_balance ?? 0);

      if (!customerId || currentBalance <= 0) {
        continue;
      }

      const { data: txRows, error: txError } = await this.supabaseService
        .getClient()
        .from('loyalty_transactions')
        .select('type, points, description, created_at')
        .eq('tenant_id', tenantId)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: true });

      if (txError) {
        throw new InternalServerErrorException(txError.message);
      }

      const pointsToExpire = computePointsToExpire({
        transactions: (txRows ?? []) as Array<{
          type: string;
          points: number;
          description: string | null;
          created_at: string;
        }>,
        cutoffIso,
        currentBalance,
      });

      if (pointsToExpire <= 0) {
        continue;
      }

      const debited = await this.debitCustomerPointsAtomic({
        tenantId,
        customerId,
        points: pointsToExpire,
        allowPartialClamp: true,
      });

      if (debited <= 0) {
        continue;
      }

      await this.insertTransaction({
        tenantId,
        customerId,
        type: 'EXPIRED',
        points: debited,
        description: buildExpirationDescription(expirationDays),
      });
    }
  }

  async applyWelcomeBonusIfEligible(
    tenantId: string,
    customerId: string,
  ): Promise<void> {
    const settings = await this.getSettingsForTenant(tenantId);

    if (!settings.is_active || settings.welcome_bonus <= 0) {
      return;
    }

    const alreadyAwarded = await this.resolveWelcomeBonusPointsForCustomer(
      tenantId,
      customerId,
    );

    if (alreadyAwarded > 0) {
      return;
    }

    await this.assertCustomerBelongsToTenant(customerId, tenantId);

    await this.creditCustomerPointsAtomic({
      tenantId,
      customerId,
      points: settings.welcome_bonus,
    });

    await this.insertTransaction({
      tenantId,
      customerId,
      type: 'EARNED',
      points: settings.welcome_bonus,
      description: LOYALTY_WELCOME_BONUS_DESCRIPTION,
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
      .eq('description', LOYALTY_WELCOME_BONUS_DESCRIPTION)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ? Number(data.points ?? 0) : 0;
  }

  private async hasCompletionEarnForAppointment(
    tenantId: string,
    appointmentId: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('loyalty_transactions')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('appointment_id', appointmentId)
      .eq('type', 'EARNED')
      .eq('description', LOYALTY_COMPLETION_EARN_DESCRIPTION)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return Boolean(data);
  }

  private async debitCustomerPointsAtomic(params: {
    tenantId: string;
    customerId: string;
    points: number;
    /** When true, debit min(balance, points) instead of failing on shortfall. */
    allowPartialClamp?: boolean;
  }): Promise<number> {
    if (params.points <= 0) {
      throw new BadRequestException('Pontos a debitar devem ser positivos.');
    }

    let pointsToDebit = params.points;

    if (params.allowPartialClamp) {
      const customer = await this.assertCustomerBelongsToTenant(
        params.customerId,
        params.tenantId,
      );
      pointsToDebit = Math.min(customer.points_balance, params.points);

      if (pointsToDebit <= 0) {
        return 0;
      }
    }

    const { error } = await this.supabaseService
      .getClient()
      .rpc('debit_customer_loyalty_points', {
        p_customer_id: params.customerId,
        p_tenant_id: params.tenantId,
        p_points: pointsToDebit,
      });

    if (error) {
      const message = error.message ?? '';
      if (message.includes('insufficient_loyalty_points')) {
        throw new BadRequestException('Saldo de pontos insuficiente.');
      }

      throw new InternalServerErrorException(message);
    }

    return pointsToDebit;
  }

  private async creditCustomerPointsAtomic(params: {
    tenantId: string;
    customerId: string;
    points: number;
  }): Promise<number> {
    if (params.points <= 0) {
      throw new BadRequestException('Pontos a creditar devem ser positivos.');
    }

    const { error } = await this.supabaseService
      .getClient()
      .rpc('credit_customer_loyalty_points', {
        p_customer_id: params.customerId,
        p_tenant_id: params.tenantId,
        p_points: params.points,
      });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return params.points;
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

  private async findCustomerByAuthUser(
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
    if (!Number.isFinite(dto.pointsPerCurrency) || dto.pointsPerCurrency < 0) {
      throw new BadRequestException(
        'Field "pointsPerCurrency" must be greater than or equal to zero',
      );
    }

    if (!Number.isInteger(dto.welcomeBonus) || dto.welcomeBonus < 0) {
      throw new BadRequestException(
        'Field "welcomeBonus" must be an integer greater than or equal to zero',
      );
    }

    if (
      dto.defaultServicePoints !== undefined &&
      (!Number.isInteger(dto.defaultServicePoints) ||
        dto.defaultServicePoints < 0)
    ) {
      throw new BadRequestException(
        'Field "defaultServicePoints" must be an integer greater than or equal to zero',
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
      default_service_points: 0,
      expiration_days: null,
      welcome_bonus: 0,
      refund_points_on_no_show: false,
      updated_at: new Date().toISOString(),
    };
  }

  private mapSettingsRow(row: LoyaltySettings): LoyaltySettings {
    return {
      ...row,
      points_per_currency: Number(row.points_per_currency),
      default_service_points: Number(row.default_service_points ?? 0),
      expiration_days:
        row.expiration_days === null || row.expiration_days === undefined
          ? null
          : Number(row.expiration_days),
      welcome_bonus: Number(row.welcome_bonus ?? 0),
      refund_points_on_no_show: Boolean(row.refund_points_on_no_show),
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

  private mapRedemptionHistoryRow(row: {
    id: string;
    customer_id: string;
    points: number | string;
    description: string;
    appointment_id: string | null;
    created_at: string;
    customers:
      | { name: string; phone: string }
      | { name: string; phone: string }[]
      | null;
    appointments:
      | { start_time: string }
      | { start_time: string }[]
      | null;
  }): LoyaltyRedemptionHistoryItem {
    const customerRelation = row.customers;
    const customer = Array.isArray(customerRelation)
      ? customerRelation[0]
      : customerRelation;

    const appointmentRelation = row.appointments;
    const appointment = Array.isArray(appointmentRelation)
      ? appointmentRelation[0]
      : appointmentRelation;

    return {
      id: row.id,
      customer_id: row.customer_id,
      customer_name: customer?.name?.trim() || 'Cliente',
      customer_phone: customer?.phone?.trim() || '',
      reward_title: parseRewardTitleFromRedemptionDescription(row.description),
      points: Number(row.points ?? 0),
      description: row.description,
      appointment_id: row.appointment_id,
      appointment_start_time: appointment?.start_time ?? null,
      created_at: row.created_at,
      source: resolveRedemptionSource(row.description),
    };
  }

  private mapTransactionRow(row: LoyaltyTransaction): LoyaltyTransaction {
    return {
      ...row,
      points: Number(row.points),
    };
  }
}
