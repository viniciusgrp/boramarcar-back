import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { PlanTier } from '../tenants/entities/plan-tier.type';
import type { Tenant } from '../tenants/entities/tenant.entity';
import { normalizePlanTier } from '../tenants/utils/plan-tier.util';
import { AffiliatesService } from '../affiliates/affiliates.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { AsaasClient } from '../asaas/asaas.client';
import {
  AsaasHttpError,
  isAsaasDuplicateAccountError,
} from '../asaas/asaas-http.error';
import type {
  AsaasAccount,
  AsaasPayment,
  AsaasSubscription,
  AsaasWebhookEvent,
  CreateAsaasAccountPayload,
} from '../asaas/asaas.types';
import { SupabaseService } from '../supabase/supabase.service';
import { TenantsService } from '../tenants/tenants.service';
import { CheckoutSessionResponse } from './entities/checkout-session-response.entity';
import type { AsaasAccountStatusResponse } from './entities/asaas-account-status.entity';
import { WebhookAckResponse } from './entities/webhook-ack-response.entity';
import { resolveSubscriptionTrialTransition } from './utils/subscription-trial-transition.util';
import { normalizeAsaasCpfCnpj } from './utils/asaas-document.util';
import {
  tenantHasManageableSubscription,
  tenantHasPendingAsaasSubscription,
} from './utils/tenant-billing-access.util';
import {
  isComplimentaryAccessActive,
  parseUtcInstant,
} from '../tenants/utils/tenant-access.util';
import { isProductionAppEnv } from '../common/app-env.util';
import { resolveTenantDepositApplicationFeePercent } from './utils/deposit-application-fee.util';
import {
  isPaidSubscriptionGraceExpired,
  periodEndFromPaidChargeDate,
  toAsaasDate,
} from './utils/billing-grace.util';
import {
  resolvePlanTierFromValue,
  resolvePlanValueBrl,
  resolveSupportAiValueBrl,
} from './utils/asaas-plan-value.util';
import {
  buildDepositExternalReference,
  buildPlanExternalReference,
  buildSupportAiExternalReference,
  isSupportAiExternalReference,
  parseDepositExternalReference,
  parsePlanExternalReference,
} from './utils/asaas-external-reference.util';
import { isValidAsaasWebhookToken } from './utils/asaas-webhook-auth.util';

export interface CreateCheckoutSessionParams {
  tenantId: string;
  tenantName: string;
  ownerEmail: string;
  planTier: PlanTier;
  cpfCnpj?: string | null;
}

export interface CreateDepositCheckoutSessionParams {
  appointmentId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  depositAmountBrl: number;
  accessToken: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
}

const PAID_PAYMENT_STATUSES = new Set(['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH']);
const OPEN_INVOICE_STATUSES = new Set(['PENDING', 'OVERDUE']);

const CHECKOUT_ITEM_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const SUBACCOUNT_WEBHOOK_EVENTS = [
  'ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED',
  'ACCOUNT_STATUS_GENERAL_APPROVAL_REJECTED',
  'ACCOUNT_STATUS_DOCUMENT_APPROVED',
  'ACCOUNT_STATUS_DOCUMENT_REJECTED',
];

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly tenantsService: TenantsService,
    private readonly supabaseService: SupabaseService,
    @Inject(forwardRef(() => AppointmentsService))
    private readonly appointmentsService: AppointmentsService,
    private readonly affiliatesService: AffiliatesService,
    private readonly asaasClient: AsaasClient,
  ) {}

  private isAsaasSandboxUrl(): boolean {
    const url = this.configService.get<string>('ASAAS_API_URL')?.trim() ?? '';

    try {
      return new URL(url).hostname === 'api-sandbox.asaas.com';
    } catch {
      return false;
    }
  }

  private isAsaasOutboundEnabled(): boolean {
    return (
      isProductionAppEnv(this.configService.get<string>('APP_ENV')) ||
      this.isAsaasSandboxUrl()
    );
  }

  private ensureAsaasOutbound(action: string): void {
    if (this.isAsaasOutboundEnabled()) {
      return;
    }

    this.logger.warn(
      `Skipped Asaas "${action}" because APP_ENV is not production and ASAAS_API_URL is not the sandbox.`,
    );
    throw new BadRequestException(
      'Asaas não está disponível neste ambiente.',
    );
  }

  async handleAsaasWebhook(
    accessToken: string | undefined,
    body: AsaasWebhookEvent | undefined,
  ): Promise<WebhookAckResponse> {
    const expected = this.configService.get<string>('ASAAS_WEBHOOK_TOKEN');

    if (!isValidAsaasWebhookToken(accessToken, expected)) {
      throw new UnauthorizedException('Invalid Asaas webhook token');
    }

    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Missing Asaas webhook body');
    }

    const eventId = body.id?.trim();
    const eventType = body.event?.trim();

    if (!eventId || !eventType) {
      throw new BadRequestException('Missing Asaas event id');
    }

    const claimed = await this.claimWebhookEvent(eventId, eventType);

    if (!claimed) {
      this.logger.debug(`Skipping already processed Asaas event ${eventId}`);
      return { received: true };
    }

    try {
      await this.processAsaasWebhookEvent(body);
    } catch (error) {
      await this.releaseWebhookEventClaim(eventId);
      throw error;
    }

    return { received: true };
  }

  private async claimWebhookEvent(
    eventId: string,
    eventType: string,
  ): Promise<boolean> {
    const { error } = await this.supabaseService
      .getClient()
      .from('asaas_webhook_events')
      .insert({
        event_id: eventId,
        event_type: eventType,
      });

    if (!error) {
      return true;
    }

    if (error.code === '23505') {
      return false;
    }

    throw new InternalServerErrorException(
      `Failed to claim Asaas webhook event: ${error.message}`,
    );
  }

  private async releaseWebhookEventClaim(eventId: string): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from('asaas_webhook_events')
      .delete()
      .eq('event_id', eventId);

    if (error) {
      this.logger.error(
        `Failed to release Asaas webhook claim for ${eventId}: ${error.message}`,
      );
    }
  }

  async processAsaasWebhookEvent(event: AsaasWebhookEvent): Promise<void> {
    const type = event.event?.trim() ?? '';

    if (type.startsWith('PAYMENT_')) {
      await this.handlePaymentEvent(type, event.payment);
      return;
    }

    if (type.startsWith('SUBSCRIPTION_')) {
      await this.handleSubscriptionEvent(type, event.subscription);
      return;
    }

    if (type.startsWith('ACCOUNT_STATUS_')) {
      await this.handleAccountStatusEvent(type, event.account);
      return;
    }

    if (type.startsWith('CHECKOUT_')) {
      await this.handleCheckoutEvent(type, event);
      return;
    }

    this.logger.debug(`Unhandled Asaas event type: ${type}`);
  }

  private async handlePaymentEvent(
    type: string,
    payment: AsaasPayment | undefined,
  ): Promise<void> {
    if (!payment?.id) {
      return;
    }

    const depositAppointmentId = parseDepositExternalReference(
      payment.externalReference,
    );

    if (depositAppointmentId) {
      await this.handleDepositPaymentEvent(type, payment, depositAppointmentId);
      return;
    }

    if (isSupportAiExternalReference(payment.externalReference)) {
      await this.handleSupportAiPaymentEvent(type, payment);
      return;
    }

    if (type === 'PAYMENT_CONFIRMED' || type === 'PAYMENT_RECEIVED') {
      await this.handlePlanPaymentReceived(payment);
      return;
    }

    if (type === 'PAYMENT_REFUNDED') {
      await this.affiliatesService.reverseInvoice(payment.id, 'payment_refunded');
    }
  }

  private async handlePlanPaymentReceived(payment: AsaasPayment): Promise<void> {
    const tenant = await this.resolveTenantFromPayment(payment);

    if (!tenant) {
      this.logger.warn(
        `Plan payment ${payment.id} without tenant (customer=${payment.customer ?? 'n/a'})`,
      );
      return;
    }

    const paymentSubscriptionId = payment.subscription?.trim() || null;
    const currentSubscriptionId = tenant.asaas_subscription_id?.trim() || null;

    if (tenant.subscription_status === 'CANCELED') {
      this.logger.warn(
        `Ignoring late plan payment ${payment.id} for canceled tenant ${tenant.id}`,
      );
      return;
    }

    if (
      currentSubscriptionId &&
      paymentSubscriptionId &&
      paymentSubscriptionId !== currentSubscriptionId
    ) {
      this.logger.warn(
        `Ignoring plan payment ${payment.id} for subscription ${paymentSubscriptionId}; tenant ${tenant.id} is on ${currentSubscriptionId}`,
      );
      return;
    }

    const planRef = parsePlanExternalReference(payment.externalReference);
    const planTier = planRef?.planTier ?? tenant.plan_tier;
    const subscriptionExpiresAt = this.periodEndFromPaidCharge(payment);
    const trialTransition = resolveSubscriptionTrialTransition(tenant, 'ACTIVE');

    await this.tenantsService.updateSubscriptionByTenantId(tenant.id, {
      asaasCustomerId: payment.customer ?? tenant.asaas_customer_id,
      asaasSubscriptionId: payment.subscription ?? tenant.asaas_subscription_id,
      asaasPendingPaymentId: null,
      asaasOpenInvoiceUrl: null,
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt,
      planTier,
      ...trialTransition,
    });

    const amountPaidCents = Math.round((payment.value ?? 0) * 100);
    await this.affiliatesService.accruePaidPlanInvoice({
      providerPaymentId: payment.id,
      asaasCustomerId: payment.customer ?? tenant.asaas_customer_id ?? '',
      amountPaid: amountPaidCents,
      planGrossCents: amountPaidCents,
      paidAtIso: new Date().toISOString(),
    });

    this.logger.log(
      `Plan payment received: tenant=${tenant.id} payment=${payment.id} plan_tier=${planTier}`,
    );
  }

  private async handleSupportAiPaymentEvent(
    type: string,
    payment: AsaasPayment,
  ): Promise<void> {
    const tenant = await this.resolveTenantFromPayment(payment);

    if (!tenant) {
      return;
    }

    if (type === 'PAYMENT_CONFIRMED' || type === 'PAYMENT_RECEIVED') {
      await this.tenantsService.updateSupportAiEntitlement(tenant.id, {
        supportAiEnabled: true,
        supportAiAsaasSubscriptionId:
          payment.subscription ?? tenant.support_ai_asaas_subscription_id,
        supportAiStatus: 'active',
      });
      return;
    }

    if (type === 'PAYMENT_REFUNDED') {
      await this.tenantsService.updateSupportAiEntitlement(tenant.id, {
        supportAiEnabled: false,
        supportAiAsaasSubscriptionId: tenant.support_ai_asaas_subscription_id,
        supportAiStatus: 'canceled',
      });
      return;
    }

    if (type === 'PAYMENT_OVERDUE') {
      await this.tenantsService.updateSupportAiEntitlement(tenant.id, {
        supportAiEnabled: false,
        supportAiAsaasSubscriptionId: tenant.support_ai_asaas_subscription_id,
        supportAiStatus: 'past_due',
      });
    }
  }

  private async handleDepositPaymentEvent(
    type: string,
    payment: AsaasPayment,
    appointmentId: string,
  ): Promise<void> {
    if (type === 'PAYMENT_CONFIRMED' || type === 'PAYMENT_RECEIVED') {
      const result =
        await this.appointmentsService.confirmDepositPaymentDetailed(
          appointmentId,
        );

      if (result.outcome === 'confirmed' || result.outcome === 'already_confirmed') {
        return;
      }

      if (result.outcome === 'late_payment_needs_refund') {
        await this.refundLateDepositPayment(payment.id, appointmentId);
      }
      return;
    }

    if (
      type === 'PAYMENT_DELETED' ||
      type === 'PAYMENT_OVERDUE' ||
      type === 'PAYMENT_REFUNDED'
    ) {
      if (type === 'PAYMENT_REFUNDED') {
        await this.appointmentsService.markDepositRefunded(appointmentId);
        return;
      }

      await this.appointmentsService.releasePendingDepositHold(appointmentId);
    }
  }

  private async refundLateDepositPayment(
    paymentId: string,
    appointmentId: string,
  ): Promise<void> {
    if (!this.isAsaasOutboundEnabled()) {
      this.logger.warn(
        `Skipped Asaas refund for appointment ${appointmentId} because APP_ENV is not production.`,
      );
      return;
    }

    try {
      await this.asaasClient.refundPayment(paymentId);
      await this.appointmentsService.markDepositRefunded(appointmentId);
      this.logger.log(
        `Auto-refunded late deposit payment for cancelled appointment ${appointmentId}`,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown refund error';
      this.logger.error(
        `Failed to auto-refund late deposit for appointment ${appointmentId}: ${message}`,
      );
      throw error instanceof Error
        ? error
        : new InternalServerErrorException(message);
    }
  }

  private async handleSubscriptionEvent(
    type: string,
    subscription: AsaasSubscription | undefined,
  ): Promise<void> {
    if (!subscription?.id) {
      return;
    }

    if (
      type === 'SUBSCRIPTION_DELETED' ||
      type === 'SUBSCRIPTION_INACTIVATED'
    ) {
      await this.applySubscriptionCanceled(subscription);
    }
  }

  private async applySubscriptionCanceled(
    subscription: AsaasSubscription,
  ): Promise<void> {
    if (isSupportAiExternalReference(subscription.externalReference)) {
      const tenant = await this.tenantsService.findBySupportAiAsaasSubscriptionId(
        subscription.id,
      );

      if (tenant) {
        await this.tenantsService.updateSupportAiEntitlement(tenant.id, {
          supportAiEnabled: false,
          supportAiAsaasSubscriptionId: null,
          supportAiStatus: 'canceled',
        });
      }
      return;
    }

    const existing = await this.tenantsService.findByAsaasSubscriptionId(
      subscription.id,
    );

    if (!existing || existing.asaas_subscription_id !== subscription.id) {
      this.logger.warn(
        `Ignoring ${subscription.id} cancellation because it is not the current subscription`,
      );
      return;
    }

    if (isComplimentaryAccessActive(existing)) {
      const nextStatus =
        existing.subscription_status === 'ACTIVE'
          ? 'INACTIVE'
          : existing.subscription_status;

      await this.tenantsService.updateSubscriptionByTenantId(existing.id, {
        subscriptionStatus: nextStatus,
        asaasSubscriptionId: null,
        asaasPendingPaymentId: null,
      });
      return;
    }

    const trialTransition = resolveSubscriptionTrialTransition(
      existing,
      'CANCELED',
    );

    await this.tenantsService.updateSubscriptionByTenantId(existing.id, {
      subscriptionStatus: 'CANCELED',
      asaasSubscriptionId: null,
      asaasPendingPaymentId: null,
      planTier: 'SOLO',
      ...trialTransition,
    });
  }

  private async handleCheckoutEvent(
    type: string,
    event: AsaasWebhookEvent,
  ): Promise<void> {
    if (type !== 'CHECKOUT_PAID') {
      return;
    }

    const reference =
      event.checkout?.externalReference?.trim() ||
      event.payment?.externalReference?.trim() ||
      '';
    const appointmentId = parseDepositExternalReference(reference);

    if (!appointmentId) {
      this.logger.warn(
        `CHECKOUT_PAID ${event.checkout?.id ?? event.id ?? ''} without a deposit reference`,
      );
      return;
    }

    const result =
      await this.appointmentsService.confirmDepositPaymentDetailed(appointmentId);

    if (result.outcome === 'confirmed' || result.outcome === 'already_confirmed') {
      return;
    }

    if (result.outcome !== 'late_payment_needs_refund') {
      return;
    }

    const paymentId =
      event.payment?.id ?? (await this.findPaidDepositPaymentId(reference));

    if (!paymentId) {
      this.logger.warn(
        `Late checkout payment for appointment ${appointmentId} has no Asaas payment to refund`,
      );
      return;
    }

    await this.refundLateDepositPayment(paymentId, appointmentId);
  }

  private async findPaidDepositPaymentId(
    externalReference: string,
  ): Promise<string | null> {
    if (!externalReference || !this.isAsaasOutboundEnabled()) {
      return null;
    }

    const listed = await this.asaasClient.listPayments({
      externalReference,
      limit: 10,
    });

    return (
      listed.data?.find(
        (payment) =>
          Boolean(payment.id) &&
          PAID_PAYMENT_STATUSES.has(payment.status ?? ''),
      )?.id ?? null
    );
  }

  private async handleAccountStatusEvent(
    type: string,
    account: AsaasAccount | undefined,
  ): Promise<void> {
    const accountId = account?.id?.trim();

    if (!accountId) {
      return;
    }

    const tenant = await this.tenantsService.findByAsaasAccountId(accountId);

    if (!tenant) {
      return;
    }

    const general = account?.accountStatus?.general?.trim();
    const chargesEnabled =
      type === 'ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED' ||
      general === 'APPROVED';
    const generalRejected =
      type === 'ACCOUNT_STATUS_GENERAL_APPROVAL_REJECTED' ||
      general === 'REJECTED';

    if (chargesEnabled || generalRejected) {
      await this.tenantsService.updateAsaasAccountStatus(tenant.id, {
        asaasChargesEnabled: chargesEnabled,
        asaasDetailsSubmitted:
          chargesEnabled ||
          account?.accountStatus?.documentation === 'APPROVED',
        asaasAccountStatus: chargesEnabled ? 'APPROVED' : 'REJECTED',
      });
      return;
    }

    if (
      type === 'ACCOUNT_STATUS_DOCUMENT_APPROVED' ||
      type === 'ACCOUNT_STATUS_DOCUMENT_REJECTED'
    ) {
      await this.tenantsService.updateAsaasAccountStatus(tenant.id, {
        asaasDetailsSubmitted: type === 'ACCOUNT_STATUS_DOCUMENT_APPROVED',
      });
    }
  }

  private async resolveTenantFromPayment(
    payment: AsaasPayment,
  ): Promise<Tenant | null> {
    if (isSupportAiExternalReference(payment.externalReference)) {
      const tenantId = payment.externalReference
        ?.slice('support-ai:'.length)
        .trim();

      if (tenantId) {
        return this.tenantsService.findById(tenantId);
      }
    }

    const planRef = parsePlanExternalReference(payment.externalReference);

    if (planRef?.tenantId) {
      return this.tenantsService.findById(planRef.tenantId);
    }

    if (payment.subscription) {
      const bySub = await this.tenantsService.findByAsaasSubscriptionId(
        payment.subscription,
      );
      if (bySub) {
        return bySub;
      }
    }

    if (payment.customer) {
      return this.tenantsService.findByAsaasCustomerId(payment.customer);
    }

    return null;
  }

  private periodEndFromPaidCharge(payment: AsaasPayment): string | null {
    return periodEndFromPaidChargeDate(
      payment.dueDate ?? payment.paymentDate ?? payment.confirmedDate,
    );
  }

  private nextDueDateToIso(value: string | null | undefined): string | null {
    if (!value?.trim()) {
      return null;
    }

    const parsed = parseUtcInstant(`${value.trim()}T00:00:00.000Z`);
    return parsed?.toISOString() ?? null;
  }

  async createCheckoutSession(
    params: CreateCheckoutSessionParams,
  ): Promise<CheckoutSessionResponse> {
    this.ensureAsaasOutbound('subscriptions.create');

    const tenant = await this.tenantsService.findById(params.tenantId);

    if (!tenant) {
      throw new NotFoundException(
        `Tenant with id "${params.tenantId}" was not found`,
      );
    }

    if (tenantHasManageableSubscription(tenant)) {
      throw new BadRequestException(
        'Você já possui uma assinatura ativa. Use Gerenciar assinatura para trocar de plano ou cancelar.',
      );
    }

    const planTier = normalizePlanTier(params.planTier);

    if (tenantHasPendingAsaasSubscription(tenant)) {
      try {
        return await this.resumePendingSubscription(tenant, planTier);
      } catch (error) {
        this.rethrowAsaasError(
          error,
          'Não foi possível abrir a fatura da assinatura pendente.',
        );
      }
    }

    const ownerEmail = params.ownerEmail.trim();

    if (!ownerEmail) {
      throw new BadRequestException(
        'Authenticated user must have an email to start checkout',
      );
    }

    const customerId = await this.ensureAsaasCustomer(tenant, {
      email: ownerEmail,
      name: params.tenantName,
      cpfCnpj: params.cpfCnpj,
    });

    const trialEndsAt = parseUtcInstant(tenant.trial_ends_at);
    const now = new Date();
    const nextDueDate =
      trialEndsAt && trialEndsAt.getTime() > now.getTime()
        ? toAsaasDate(trialEndsAt)
        : toAsaasDate(now);

    const value = resolvePlanValueBrl(this.configService, planTier);

    try {
      const subscription = await this.asaasClient.createSubscription({
        customer: customerId,
        billingType: 'UNDEFINED',
        value,
        nextDueDate,
        cycle: 'MONTHLY',
        description: `Horário Certo ${planTier}`,
        externalReference: buildPlanExternalReference(tenant.id, planTier),
      });

      const pendingPayment = await this.findLatestSubscriptionPayment(
        subscription.id,
      );

      await this.tenantsService.updateSubscriptionByTenantId(tenant.id, {
        asaasCustomerId: customerId,
        asaasSubscriptionId: subscription.id,
        asaasPendingPaymentId: pendingPayment?.id ?? null,
        asaasOpenInvoiceUrl: pendingPayment?.invoiceUrl ?? null,
        subscriptionStatus: tenant.subscription_status,
        planTier,
      });

      const invoiceUrl = pendingPayment?.invoiceUrl;

      if (!invoiceUrl) {
        throw new InternalServerErrorException(
          'Asaas did not return an invoice URL',
        );
      }

      return { url: invoiceUrl };
    } catch (error) {
      this.rethrowAsaasError(
        error,
        'Não foi possível criar a assinatura no Asaas.',
      );
    }
  }

  async changePlan(tenantId: string, planTier: PlanTier): Promise<Tenant> {
    this.ensureAsaasOutbound('subscriptions.update');

    const tenant = await this.requireTenant(tenantId);

    if (!tenantHasManageableSubscription(tenant) || !tenant.asaas_subscription_id) {
      throw new BadRequestException(
        'Você precisa de uma assinatura ativa para trocar de plano.',
      );
    }

    const nextTier = normalizePlanTier(planTier);
    const value = resolvePlanValueBrl(this.configService, nextTier);

    try {
      await this.asaasClient.updateSubscription(tenant.asaas_subscription_id, {
        value,
        description: `Horário Certo ${nextTier}`,
        externalReference: buildPlanExternalReference(tenant.id, nextTier),
        updatePendingPayments: true,
      });
    } catch (error) {
      this.rethrowAsaasError(
        error,
        'Não foi possível atualizar o plano no Asaas.',
      );
    }

    const updated = await this.tenantsService.updateSubscriptionByTenantId(
      tenant.id,
      {
        subscriptionStatus: tenant.subscription_status,
        planTier: nextTier,
      },
    );

    if (!updated) {
      throw new InternalServerErrorException(
        'Não foi possível gravar o novo plano.',
      );
    }

    return updated;
  }

  async cancelSubscription(tenantId: string): Promise<Tenant> {
    this.ensureAsaasOutbound('subscriptions.delete');

    const tenant = await this.requireTenant(tenantId);

    if (!tenant.asaas_subscription_id && !tenant.support_ai_asaas_subscription_id) {
      throw new BadRequestException('Não há assinatura Asaas para cancelar.');
    }

    if (tenant.support_ai_asaas_subscription_id) {
      try {
        await this.asaasClient.deleteSubscription(
          tenant.support_ai_asaas_subscription_id,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to cancel Support AI subscription for tenant ${tenant.id}: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      }
    }

    if (tenant.asaas_subscription_id) {
      try {
        await this.asaasClient.deleteSubscription(tenant.asaas_subscription_id);
      } catch (error) {
        this.rethrowAsaasError(
          error,
          'Não foi possível cancelar a assinatura no Asaas.',
        );
      }
    }

    if (isComplimentaryAccessActive(tenant)) {
      const updated = await this.tenantsService.updateSubscriptionByTenantId(
        tenant.id,
        {
          subscriptionStatus:
            tenant.subscription_status === 'ACTIVE'
              ? 'INACTIVE'
              : tenant.subscription_status,
          asaasSubscriptionId: null,
          asaasPendingPaymentId: null,
        },
      );

      await this.tenantsService.updateSupportAiEntitlement(tenant.id, {
        supportAiEnabled: false,
        supportAiAsaasSubscriptionId: null,
        supportAiStatus: 'canceled',
      });

      return updated ?? tenant;
    }

    const trialTransition = resolveSubscriptionTrialTransition(
      tenant,
      'CANCELED',
    );

    const updated = await this.tenantsService.updateSubscriptionByTenantId(
      tenant.id,
      {
        subscriptionStatus: 'CANCELED',
        asaasSubscriptionId: null,
        asaasPendingPaymentId: null,
        planTier: 'SOLO',
        ...trialTransition,
      },
    );

    await this.tenantsService.updateSupportAiEntitlement(tenant.id, {
      supportAiEnabled: false,
      supportAiAsaasSubscriptionId: null,
      supportAiStatus: 'canceled',
    });

    if (!updated) {
      throw new InternalServerErrorException(
        'Não foi possível cancelar a assinatura.',
      );
    }

    return updated;
  }

  async getOpenInvoiceUrl(tenantId: string): Promise<CheckoutSessionResponse> {
    this.ensureAsaasOutbound('payments.list');

    const tenant = await this.requireTenant(tenantId);

    if (!tenant.asaas_subscription_id) {
      throw new BadRequestException(
        'Nenhuma fatura aberta encontrada para esta assinatura.',
      );
    }

    const payment = await this.findOpenSubscriptionPayment(
      tenant.asaas_subscription_id,
    );

    if (!payment?.invoiceUrl) {
      await this.tenantsService.updateSubscriptionByTenantId(tenant.id, {
        subscriptionStatus: tenant.subscription_status,
        asaasOpenInvoiceUrl: null,
      });
      throw new BadRequestException(
        'Nenhuma fatura aberta encontrada para esta assinatura.',
      );
    }

    await this.tenantsService.updateSubscriptionByTenantId(tenant.id, {
      subscriptionStatus: tenant.subscription_status,
      asaasOpenInvoiceUrl: payment.invoiceUrl,
      asaasPendingPaymentId: payment.id,
    });

    return { url: payment.invoiceUrl };
  }

  async syncTenantSubscription(tenantId: string): Promise<Tenant> {
    this.ensureAsaasOutbound('subscriptions.retrieve');

    const tenant = await this.requireTenant(tenantId);

    if (!tenant.asaas_subscription_id && !tenant.asaas_customer_id) {
      throw new BadRequestException(
        'Ainda não encontramos uma assinatura no Asaas. Se você acabou de pagar, aguarde alguns segundos e tente novamente.',
      );
    }

    let subscription: AsaasSubscription | null = null;

    if (tenant.asaas_subscription_id) {
      try {
        subscription = await this.asaasClient.getSubscription(
          tenant.asaas_subscription_id,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to retrieve Asaas subscription ${tenant.asaas_subscription_id}: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      }
    }

    if (!subscription) {
      throw new BadRequestException(
        'Ainda não encontramos uma assinatura no Asaas. Se você acabou de pagar, aguarde alguns segundos e tente novamente.',
      );
    }

    const payment = await this.findLatestSubscriptionPayment(subscription.id);
    const paid =
      payment?.status && PAID_PAYMENT_STATUSES.has(payment.status);

    if (!paid) {
      return tenant;
    }

    const values = {
      SOLO: resolvePlanValueBrl(this.configService, 'SOLO'),
      PRO: resolvePlanValueBrl(this.configService, 'PRO'),
      ELITE: resolvePlanValueBrl(this.configService, 'ELITE'),
    };
    const planTier =
      parsePlanExternalReference(subscription.externalReference)?.planTier ??
      resolvePlanTierFromValue(subscription.value, values) ??
      tenant.plan_tier;

    const trialTransition = resolveSubscriptionTrialTransition(tenant, 'ACTIVE');
    const updated = await this.tenantsService.updateSubscriptionByTenantId(
      tenant.id,
      {
        asaasCustomerId: subscription.customer,
        asaasSubscriptionId: subscription.id,
        asaasPendingPaymentId: null,
        asaasOpenInvoiceUrl: null,
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt:
          (payment ? this.periodEndFromPaidCharge(payment) : null) ??
          this.nextDueDateToIso(subscription.nextDueDate),
        planTier,
        ...trialTransition,
      },
    );

    if (!updated) {
      throw new InternalServerErrorException(
        'Não foi possível sincronizar a assinatura com o estabelecimento.',
      );
    }

    return updated;
  }

  async addSupportAiAddon(tenantId: string): Promise<Tenant> {
    this.ensureAsaasOutbound('subscriptions.create (support-ai)');

    const tenant = await this.requireTenant(tenantId);

    if (tenant.subscription_status !== 'ACTIVE') {
      throw new BadRequestException(
        'Assine um plano ativo antes de contratar o Assistente IA. O período de testes não inclui o complemento.',
      );
    }

    if (!tenant.asaas_customer_id) {
      throw new BadRequestException(
        'Não encontramos um cliente Asaas para este estabelecimento.',
      );
    }

    if (
      tenant.support_ai_enabled &&
      tenant.support_ai_status === 'active' &&
      tenant.support_ai_asaas_subscription_id
    ) {
      throw new BadRequestException(
        'O Assistente IA já está ativo neste estabelecimento.',
      );
    }

    const value = resolveSupportAiValueBrl(this.configService);

    try {
      const subscription = await this.asaasClient.createSubscription({
        customer: tenant.asaas_customer_id,
        billingType: 'UNDEFINED',
        value,
        nextDueDate: toAsaasDate(new Date()),
        cycle: 'MONTHLY',
        description: 'Assistente IA Horário Certo',
        externalReference: buildSupportAiExternalReference(tenant.id),
      });

      return this.tenantsService.updateSupportAiEntitlement(tenant.id, {
        supportAiEnabled: false,
        supportAiAsaasSubscriptionId: subscription.id,
        supportAiStatus: 'inactive',
      });
    } catch (error) {
      this.rethrowAsaasError(
        error,
        'Não foi possível adicionar o Assistente IA à assinatura.',
      );
    }
  }

  async createDepositCheckoutSession(
    params: CreateDepositCheckoutSessionParams,
  ): Promise<string> {
    this.ensureAsaasOutbound('checkouts.create (deposit)');

    if (params.depositAmountBrl <= 0) {
      throw new BadRequestException('Deposit amount must be greater than zero');
    }

    const tenant = await this.requireTenant(params.tenantId);
    const walletId = tenant.asaas_wallet_id?.trim();

    if (!walletId || !tenant.asaas_charges_enabled) {
      throw new BadRequestException(
        'Este estabelecimento ainda não configurou a conta Asaas para receber sinais.',
      );
    }

    const successBaseUrl = this.getRequiredUrl('ASAAS_DEPOSIT_SUCCESS_URL');
    const cancelBaseUrl = this.getRequiredUrl('ASAAS_DEPOSIT_CANCEL_URL');
    const successUrl = `${successBaseUrl}${successBaseUrl.includes('?') ? '&' : '?'}appointment_id=${params.appointmentId}&access_token=${encodeURIComponent(params.accessToken)}`;
    const cancelUrl = `${cancelBaseUrl}${cancelBaseUrl.includes('?') ? '&' : '?'}appointment_id=${params.appointmentId}&tenant_slug=${encodeURIComponent(params.tenantSlug)}&access_token=${encodeURIComponent(params.accessToken)}`;

    const applicationFeePercent =
      this.resolveDepositApplicationFeePercentForTenant(tenant);
    const establishmentPercent = Math.max(
      0,
      Math.round((100 - applicationFeePercent) * 100) / 100,
    );

    try {
      const checkout = await this.asaasClient.createCheckout({
        billingTypes: ['PIX', 'CREDIT_CARD'],
        chargeTypes: ['DETACHED'],
        minutesToExpire: 30,
        callback: { successUrl, cancelUrl },
        items: [
          {
            name: `Sinal: ${params.tenantName}`,
            description: 'Pagamento antecipado para confirmar agendamento',
            quantity: 1,
            value: params.depositAmountBrl,
            imageBase64: CHECKOUT_ITEM_IMAGE_BASE64,
          },
        ],
        splits:
          establishmentPercent > 0
            ? [{ walletId, percentageValue: establishmentPercent }]
            : undefined,
        externalReference: buildDepositExternalReference(params.appointmentId),
      });

      if (!checkout.link) {
        throw new InternalServerErrorException(
          'Asaas did not return a checkout URL',
        );
      }

      return checkout.link;
    } catch (error) {
      this.rethrowAsaasError(
        error,
        'Não foi possível criar o pagamento do sinal no Asaas.',
      );
    }
  }

  buildAsaasAccountStatus(tenant: Tenant): AsaasAccountStatusResponse {
    const accountId = tenant.asaas_account_id?.trim() || null;
    const walletId = tenant.asaas_wallet_id?.trim() || null;
    const chargesEnabled = Boolean(tenant.asaas_charges_enabled);
    const detailsSubmitted = Boolean(tenant.asaas_details_submitted);
    const isReady = Boolean(walletId && chargesEnabled);

    return {
      accountId,
      walletId,
      accountStatus: tenant.asaas_account_status,
      chargesEnabled,
      detailsSubmitted,
      isReady,
      onboardingRequired: !walletId || !chargesEnabled,
      applicationFeePercent:
        this.resolveDepositApplicationFeePercentForTenant(tenant),
      canOpenDashboard: isReady,
    };
  }

  async getConnectStatus(tenantId: string): Promise<AsaasAccountStatusResponse> {
    const tenant = await this.requireTenant(tenantId);
    return this.buildAsaasAccountStatus(tenant);
  }

  async createAsaasAccount(
    tenantId: string,
    payload: CreateAsaasAccountPayload,
  ): Promise<AsaasAccountStatusResponse> {
    this.ensureAsaasOutbound('accounts.create');

    const tenant = await this.requireTenant(tenantId);

    if (tenant.asaas_wallet_id) {
      return this.buildAsaasAccountStatus(tenant);
    }

    try {
      const account = await this.asaasClient.createAccount({
        ...payload,
        cpfCnpj: payload.cpfCnpj.replace(/\D/g, ''),
        postalCode: payload.postalCode.replace(/\D/g, ''),
        webhooks: [this.buildSubaccountWebhook()],
      });

      if (!account.walletId) {
        throw new InternalServerErrorException(
          'Asaas did not return a walletId',
        );
      }

      const updated = await this.tenantsService.updateAsaasAccountStatus(
        tenant.id,
        {
          asaasAccountId: account.id ?? null,
          asaasWalletId: account.walletId,
          asaasChargesEnabled: false,
          asaasDetailsSubmitted: false,
          asaasAccountStatus: 'PENDING',
        },
      );

      return this.buildAsaasAccountStatus(updated ?? tenant);
    } catch (error) {
      if (error instanceof AsaasHttpError && isAsaasDuplicateAccountError(error)) {
        throw new BadRequestException(
          'Este e-mail ou documento já possui uma conta no Asaas. Use outro e-mail para criar a subconta.',
        );
      }

      this.rethrowAsaasError(
        error,
        'Não foi possível criar a conta Asaas do estabelecimento.',
      );
    }
  }

  async syncAsaasAccount(tenantId: string): Promise<Tenant | null> {
    const tenant = await this.requireTenant(tenantId);

    if (!tenant.asaas_account_id || !this.isAsaasOutboundEnabled()) {
      return tenant;
    }

    try {
      const account = await this.asaasClient.getAccount(tenant.asaas_account_id);
      const general = account.accountStatus?.general?.trim();

      if (!general) {
        this.logger.warn(
          `Asaas account ${tenant.asaas_account_id} returned no general status. Local charges flag was kept.`,
        );
        return tenant;
      }

      return this.tenantsService.updateAsaasAccountStatus(tenant.id, {
        asaasChargesEnabled: general === 'APPROVED',
        asaasDetailsSubmitted:
          account.accountStatus?.documentation === 'APPROVED' ||
          general === 'APPROVED',
        asaasAccountStatus: general,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to sync Asaas account ${tenant.asaas_account_id}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      return tenant;
    }
  }

  async createConnectDashboardLink(
    tenantId: string,
  ): Promise<CheckoutSessionResponse> {
    await this.requireTenant(tenantId);
    return { url: 'https://www.asaas.com/' };
  }

  @Cron('15 8 * * *')
  async markPastDueAfterGrace(): Promise<void> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select('*')
      .eq('subscription_status', 'ACTIVE')
      .not('asaas_subscription_id', 'is', null)
      .not('subscription_expires_at', 'is', null);

    if (error) {
      this.logger.error(`Failed to load tenants for billing grace: ${error.message}`);
      return;
    }

    const now = new Date();

    for (const row of data ?? []) {
      const tenant = row as Tenant;

      if (!isPaidSubscriptionGraceExpired(tenant, now)) {
        continue;
      }

      const coverage = await this.asaasStillCoversSubscription(tenant, now);

      if (coverage.covered) {
        await this.extendExpiryFromPaidCharge(
          tenant,
          coverage.subscriptionExpiresAt,
        );
        continue;
      }

      await this.tenantsService.updateSubscriptionByTenantId(tenant.id, {
        subscriptionStatus: 'PAST_DUE',
      });
      this.logger.log(`Marked PAST_DUE after grace: tenant=${tenant.id}`);
    }
  }

  private async resumePendingSubscription(
    tenant: Tenant,
    planTier: PlanTier,
  ): Promise<CheckoutSessionResponse> {
    const subscriptionId = tenant.asaas_subscription_id?.trim();

    if (!subscriptionId) {
      throw new BadRequestException(
        'Não encontramos a assinatura pendente deste estabelecimento.',
      );
    }

    if (normalizePlanTier(tenant.plan_tier) !== planTier) {
      const value = resolvePlanValueBrl(this.configService, planTier);

      await this.asaasClient.updateSubscription(subscriptionId, {
        value,
        description: `Horário Certo ${planTier}`,
        externalReference: buildPlanExternalReference(tenant.id, planTier),
        updatePendingPayments: true,
      });
    }

    const pendingPayment = await this.findOpenSubscriptionPayment(subscriptionId);
    const invoiceUrl = pendingPayment?.invoiceUrl?.trim();

    if (!invoiceUrl) {
      throw new BadRequestException(
        'Não encontramos a fatura da assinatura já criada. Atualize o status e tente de novo.',
      );
    }

    await this.tenantsService.updateSubscriptionByTenantId(tenant.id, {
      subscriptionStatus: tenant.subscription_status,
      planTier,
      asaasPendingPaymentId: pendingPayment?.id ?? tenant.asaas_pending_payment_id,
      asaasOpenInvoiceUrl: invoiceUrl,
    });

    return { url: invoiceUrl };
  }

  private async ensureAsaasCustomer(
    tenant: Tenant,
    params: { email: string; name: string; cpfCnpj?: string | null },
  ): Promise<string> {
    const existingId = tenant.asaas_customer_id?.trim();

    if (existingId) {
      return existingId;
    }

    const cpfCnpj = normalizeAsaasCpfCnpj(params.cpfCnpj);
    const customer = await this.asaasClient.createCustomer({
      email: params.email,
      name: params.name,
      cpfCnpj,
      externalReference: tenant.id,
    });

    await this.tenantsService.updateAsaasCustomerId(tenant.id, customer.id);
    return customer.id;
  }

  private buildSubaccountWebhook() {
    const origin = this.getRequiredUrl('PUBLIC_API_ORIGIN').replace(/\/$/, '');
    const authToken = this.configService.get<string>('ASAAS_WEBHOOK_TOKEN')?.trim();
    const email = this.configService.get<string>('SUPPORT_EMAIL')?.trim();

    if (!authToken) {
      throw new InternalServerErrorException('ASAAS_WEBHOOK_TOKEN is not configured');
    }

    if (!email) {
      throw new InternalServerErrorException('SUPPORT_EMAIL is not configured');
    }

    return {
      name: 'Horário Certo',
      url: `${origin}/v1/payments/asaas/webhook`,
      email,
      enabled: true,
      interrupted: false as const,
      apiVersion: 3 as const,
      authToken,
      sendType: 'SEQUENTIALLY' as const,
      events: SUBACCOUNT_WEBHOOK_EVENTS,
    };
  }

  private async extendExpiryFromPaidCharge(
    tenant: Tenant,
    subscriptionExpiresAt: string | null,
  ): Promise<void> {
    if (
      !subscriptionExpiresAt ||
      subscriptionExpiresAt <= (tenant.subscription_expires_at ?? '')
    ) {
      return;
    }

    await this.tenantsService.updateSubscriptionByTenantId(tenant.id, {
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt,
    });
    this.logger.log(
      `Updated subscription expiry from paid Asaas charge: tenant=${tenant.id} expires=${subscriptionExpiresAt}`,
    );
  }

  private async asaasStillCoversSubscription(
    tenant: Tenant,
    now: Date,
  ): Promise<{ covered: boolean; subscriptionExpiresAt: string | null }> {
    if (!tenant.asaas_subscription_id || !this.isAsaasOutboundEnabled()) {
      return { covered: true, subscriptionExpiresAt: null };
    }

    try {
      const listed = await this.asaasClient.listPayments({
        subscription: tenant.asaas_subscription_id,
        limit: 100,
      });
      const latestDue = this.findLatestDueSubscriptionPayment(
        listed.data ?? [],
        now,
      );
      const covered = Boolean(
        latestDue?.status && PAID_PAYMENT_STATUSES.has(latestDue.status),
      );

      return {
        covered,
        subscriptionExpiresAt:
          covered && latestDue ? this.periodEndFromPaidCharge(latestDue) : null,
      };
    } catch (error) {
      this.logger.warn(
        `Skipped PAST_DUE for tenant ${tenant.id}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      return { covered: true, subscriptionExpiresAt: null };
    }
  }

  private findLatestDueSubscriptionPayment(
    payments: AsaasPayment[],
    now: Date,
  ): AsaasPayment | null {
    const today = toAsaasDate(now);
    let latest: AsaasPayment | null = null;

    for (const payment of payments) {
      const dueDate = payment.dueDate?.trim();

      if (!dueDate || dueDate > today) {
        continue;
      }

      if (!latest || dueDate > (latest.dueDate ?? '')) {
        latest = payment;
      }
    }

    return latest;
  }

  private async findOpenSubscriptionPayment(
    subscriptionId: string,
  ): Promise<AsaasPayment | null> {
    const listed = await this.asaasClient.listPayments({
      subscription: subscriptionId,
      limit: 10,
    });

    return (
      listed.data?.find(
        (payment) =>
          Boolean(payment.invoiceUrl) &&
          OPEN_INVOICE_STATUSES.has(payment.status ?? ''),
      ) ?? null
    );
  }

  private async findLatestSubscriptionPayment(
    subscriptionId: string,
  ): Promise<AsaasPayment | null> {
    const listed = await this.asaasClient.listPayments({
      subscription: subscriptionId,
      limit: 5,
    });

    return listed.data?.[0] ?? null;
  }

  private async requireTenant(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenantsService.findById(tenantId);

    if (!tenant) {
      throw new NotFoundException(
        `Tenant with id "${tenantId}" was not found`,
      );
    }

    return tenant;
  }

  private getRequiredUrl(envKey: string): string {
    const value = this.configService.get<string>(envKey)?.trim();

    if (!value) {
      throw new InternalServerErrorException(`${envKey} is not configured`);
    }

    return value;
  }

  private getDefaultDepositApplicationFeePercent(): number {
    const rawPercent = this.configService.get<string>(
      'ASAAS_DEPOSIT_APPLICATION_FEE_PERCENT',
    );
    const percent = rawPercent ? Number.parseFloat(rawPercent) : 0;

    if (!Number.isFinite(percent) || percent <= 0) {
      return 0;
    }

    if (percent > 100) {
      throw new InternalServerErrorException(
        'ASAAS_DEPOSIT_APPLICATION_FEE_PERCENT must be between 0 and 100',
      );
    }

    return percent;
  }

  private resolveDepositApplicationFeePercentForTenant(tenant: Tenant): number {
    return resolveTenantDepositApplicationFeePercent(
      tenant.deposit_application_fee_percent,
      this.getDefaultDepositApplicationFeePercent(),
    );
  }

  private rethrowAsaasError(error: unknown, fallback: string): never {
    if (
      error instanceof BadRequestException ||
      error instanceof InternalServerErrorException ||
      error instanceof NotFoundException
    ) {
      throw error;
    }

    if (error instanceof AsaasHttpError) {
      throw new BadRequestException(error.message || fallback);
    }

    throw new InternalServerErrorException(fallback);
  }
}
