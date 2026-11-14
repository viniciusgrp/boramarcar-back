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
import { APP_TIME_ZONE } from '../common/app-time-zone';
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
import type {
  ChangePlanPreview,
  ChangePlanResult,
} from './entities/change-plan-preview.entity';
import type { BillingStatusResponse } from './entities/billing-status.entity';
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
import { buildDepositCheckoutItemCopy } from './utils/asaas-checkout-item.util';
import { resolveTenantDepositApplicationFeePercent } from './utils/deposit-application-fee.util';
import {
  asaasDateToIso,
  isIsoInstantAfter,
  isPaidSubscriptionGraceExpired,
  laterIsoInstant,
  periodEndFromPaidChargeDate,
  toAsaasDate,
} from './utils/billing-grace.util';
import {
  isAsaasSubscriptionCurrentlyActive,
  isCourtesyPlan,
  paymentBelongsToCurrentAsaasSubscription,
} from './utils/plan-payment-activation.util';
import {
  resolvePlanTierFromValue,
  resolvePlanValueBrl,
  resolveSupportAiValueBrl,
} from './utils/asaas-plan-value.util';
import {
  buildDepositExternalReference,
  buildPlanExternalReference,
  buildPlanUpgradeExternalReference,
  buildSupportAiExternalReference,
  isPlanUpgradeExternalReference,
  isSupportAiExternalReference,
  parseDepositExternalReference,
  parsePlanExternalReference,
  parsePlanUpgradeExternalReference,
} from './utils/asaas-external-reference.util';
import {
  ASAAS_MIN_CHARGE_BRL,
  paidPeriodDates,
  planTierLabel,
  quotePlanChange,
} from './utils/plan-change-proration.util';
import { tenantCanChargeDeposits } from '../tenants/utils/deposit-charges.util';
import { DEPOSIT_CHARGE_ALERT_MESSAGE } from '../tenants/constants/deposit-feature.constants';
import { isValidAsaasWebhookToken } from './utils/asaas-webhook-auth.util';
import { mapAsaasAccountStatusUpdate } from './utils/asaas-account-status.util';
import { buildAsaasOnboardingSteps } from './utils/asaas-onboarding-steps.util';
import {
  decryptAsaasSubaccountApiKey,
  encryptAsaasSubaccountApiKey,
} from './utils/asaas-subaccount-key.util';

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

    if (isPlanUpgradeExternalReference(payment.externalReference)) {
      await this.handlePlanUpgradePaymentEvent(type, payment);
      return;
    }

    if (type === 'PAYMENT_CONFIRMED' || type === 'PAYMENT_RECEIVED') {
      await this.handlePlanPaymentReceived(payment);
      return;
    }

    if (type === 'PAYMENT_REFUNDED') {
      await this.affiliatesService.reverseInvoice(payment.id, 'payment_refunded');
      return;
    }

    if (type === 'PAYMENT_DELETED') {
      await this.handlePlanPaymentDeleted(payment);
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
    const isCurrentSubscriptionPayment =
      Boolean(currentSubscriptionId) &&
      Boolean(paymentSubscriptionId) &&
      paymentSubscriptionId === currentSubscriptionId;

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

    if (tenant.subscription_status === 'CANCELED' && !isCurrentSubscriptionPayment) {
      this.logger.warn(
        `Ignoring late plan payment ${payment.id} for canceled tenant ${tenant.id}`,
      );
      return;
    }

    if (tenant.subscription_cancel_at && !isCurrentSubscriptionPayment) {
      this.logger.warn(
        `Ignoring plan payment ${payment.id} for tenant ${tenant.id} because cancellation is scheduled for ${tenant.subscription_cancel_at}`,
      );
      return;
    }

    if (
      await this.shouldIgnoreComplimentaryReactivation(
        tenant,
        paymentSubscriptionId,
        payment.id,
      )
    ) {
      return;
    }

    const planRef = parsePlanExternalReference(payment.externalReference);
    const downgrade = this.resolveDuePlanDowngrade(tenant, payment);
    const planTier = downgrade.planTier ?? planRef?.planTier ?? tenant.plan_tier;
    const subscriptionExpiresAt = laterIsoInstant(
      tenant.subscription_expires_at,
      this.periodEndFromPaidCharge(payment),
    );
    const trialTransition = resolveSubscriptionTrialTransition(tenant, 'ACTIVE');

    await this.tenantsService.updateSubscriptionByTenantId(tenant.id, {
      asaasCustomerId: payment.customer ?? tenant.asaas_customer_id,
      asaasSubscriptionId: payment.subscription ?? tenant.asaas_subscription_id,
      asaasPendingPaymentId: null,
      asaasOpenInvoiceUrl: null,
      subscriptionStatus: 'ACTIVE',
      subscriptionCancelAt: null,
      subscriptionExpiresAt,
      planTier,
      ...trialTransition,
      ...(downgrade.clearPending
        ? {
            pendingPlanTier: null,
            pendingPlanPaymentId: null,
            pendingPlanInvoiceUrl: null,
            pendingPlanEffectiveAt: null,
          }
        : {}),
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
      return;
    }

    if (type === 'PAYMENT_DELETED') {
      this.logger.log(
        `Support AI payment deleted: tenant=${tenant.id} payment=${payment.id}. Entitlement was not changed.`,
      );
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
          payment.id,
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

    if (existing.subscription_cancel_at) {
      this.logger.log(
        `Ignoring Asaas subscription ${subscription.id} deletion for tenant ${existing.id} because cancellation is already scheduled locally.`,
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
      await this.appointmentsService.confirmDepositPaymentDetailed(
        appointmentId,
        event.payment?.id,
      );

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

    const patch = mapAsaasAccountStatusUpdate({
      eventType: type,
      general: account?.accountStatus?.general,
      commercialInfo: account?.accountStatus?.commercialInfo,
      bankAccountInfo: account?.accountStatus?.bankAccountInfo,
      documentation: account?.accountStatus?.documentation,
    });

    if (!patch) {
      return;
    }

    await this.tenantsService.updateAsaasAccountStatus(tenant.id, patch);
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
    return asaasDateToIso(value);
  }

  /**
   * Courtesy plans live in comp_until and are stored as INACTIVE by an admin.
   * A late charge must not turn that tenant ACTIVE unless it belongs to the
   * Asaas subscription currently on the tenant and that subscription is active.
   * Trial signups are INACTIVE with no comp_until and still activate.
   */
  private async shouldIgnoreComplimentaryReactivation(
    tenant: Tenant,
    paymentSubscriptionId: string | null,
    paymentId: string,
  ): Promise<boolean> {
    if (tenant.subscription_status !== 'INACTIVE' || !isCourtesyPlan(tenant)) {
      return false;
    }

    const belongs = paymentBelongsToCurrentAsaasSubscription(
      tenant,
      paymentSubscriptionId,
    );

    if (!belongs || !paymentSubscriptionId) {
      this.logger.warn(
        `Ignoring plan payment ${paymentId} for complimentary tenant ${tenant.id}. The charge is not the current Asaas subscription, so the inactive plan stays as set.`,
      );
      return true;
    }

    const active = await this.isAsaasSubscriptionActive(paymentSubscriptionId);

    if (!active) {
      this.logger.warn(
        `Ignoring plan payment ${paymentId} for complimentary tenant ${tenant.id}. Asaas subscription ${paymentSubscriptionId} is not active, so the inactive plan stays as set.`,
      );
      return true;
    }

    return false;
  }

  private async isAsaasSubscriptionActive(
    subscriptionId: string,
  ): Promise<boolean> {
    if (!this.isAsaasOutboundEnabled()) {
      this.logger.warn(
        `Cannot confirm Asaas subscription ${subscriptionId} is active because outbound Asaas is disabled.`,
      );
      return false;
    }

    try {
      const subscription =
        await this.asaasClient.getSubscription(subscriptionId);
      return isAsaasSubscriptionCurrentlyActive(subscription);
    } catch (error) {
      if (
        error instanceof AsaasHttpError &&
        (error.statusCode === 404 || error.statusCode === 400)
      ) {
        return false;
      }

      throw error;
    }
  }

  private async handlePlanPaymentDeleted(payment: AsaasPayment): Promise<void> {
    const tenant = await this.resolveTenantFromPayment(payment);

    this.logger.log(
      `Plan payment deleted: payment=${payment.id} tenant=${tenant?.id ?? 'none'}. Subscription status was not changed.`,
    );

    await this.affiliatesService.reverseInvoice(payment.id, 'payment_deleted');

    if (!tenant) {
      return;
    }

    const pendingId = tenant.asaas_pending_payment_id?.trim() || '';
    const openUrl = tenant.asaas_open_invoice_url?.trim() || '';
    const paymentUrl = payment.invoiceUrl?.trim() || '';
    const clearsPending = Boolean(pendingId && pendingId === payment.id);
    const clearsUrl = Boolean(openUrl && paymentUrl && openUrl === paymentUrl);

    if (!clearsPending && !clearsUrl) {
      return;
    }

    await this.tenantsService.updateSubscriptionByTenantId(tenant.id, {
      subscriptionStatus: tenant.subscription_status,
      ...(clearsPending ? { asaasPendingPaymentId: null } : {}),
      asaasOpenInvoiceUrl: null,
    });
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
        const resumed = await this.resumePendingSubscription(tenant, planTier);
        if (resumed) {
          return resumed;
        }
      } catch (error) {
        this.rethrowAsaasError(
          error,
          'Não foi possível abrir a fatura da assinatura pendente.',
        );
      }

      // Sem fatura em aberto (já paga ou inexistente): não escrever no Asaas.
      // Troca de plano com assinatura ativa/paga usa changePlan (diferença).
      throw new BadRequestException(
        'Não encontramos a fatura da assinatura já criada. Atualize o status e tente de novo.',
      );
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

  async previewChangePlan(
    tenantId: string,
    planTier: PlanTier,
  ): Promise<ChangePlanPreview> {
    const tenant = await this.requireTenant(tenantId);
    return this.buildChangePlanPreview(tenant, normalizePlanTier(planTier));
  }

  async changePlan(
    tenantId: string,
    planTier: PlanTier,
  ): Promise<ChangePlanResult> {
    this.ensureAsaasOutbound('subscriptions.update');

    let tenant = await this.requireTenant(tenantId);
    tenant = await this.applyDueScheduledDowngradeIfNeeded(tenant);
    const nextTier = normalizePlanTier(planTier);

    if (tenant.subscription_cancel_at && this.hasCurrentPaidPeriod(tenant)) {
      throw new BadRequestException(
        'Reative a assinatura antes de trocar de plano.',
      );
    }

    if (
      !tenant.asaas_subscription_id ||
      (!tenantHasManageableSubscription(tenant) &&
        !tenantHasPendingAsaasSubscription(tenant))
    ) {
      throw new BadRequestException(
        'Você precisa de uma assinatura ativa para trocar de plano.',
      );
    }

    if (tenant.pending_plan_payment_id) {
      if (tenant.pending_plan_tier === nextTier) {
        return this.toChangePlanResult(
          tenant,
          this.buildChangePlanPreview(tenant, nextTier),
          {
            invoiceUrl: tenant.pending_plan_invoice_url,
            applied: false,
          },
        );
      }

      throw new BadRequestException(
        'Já existe uma troca de plano aguardando pagamento.',
      );
    }

    if (nextTier === normalizePlanTier(tenant.plan_tier)) {
      // Undo scheduled/ghost pending change when the client re-selects the current plan.
      if (tenant.pending_plan_tier || tenant.pending_plan_payment_id) {
        return this.cancelPendingPlanChange(tenant.id);
      }

      throw new BadRequestException('Você já está neste plano.');
    }

    const preview = this.buildChangePlanPreview(tenant, nextTier);

    if (!this.hasCurrentPaidPeriod(tenant)) {
      const updated = await this.applyPlanValueNow(tenant, nextTier);
      return this.toChangePlanResult(
        updated,
        {
          ...preview,
          appliesImmediately: true,
          effectiveAt: new Date().toISOString(),
          proratedAmountBrl: null,
          chargeAmountBrl: 0,
          belowAsaasMinimum: false,
        },
        { invoiceUrl: null, applied: true },
      );
    }

    if (preview.direction === 'downgrade' || preview.chargeAmountBrl <= 0) {
      await this.updateAsaasPlanValue(
        tenant.asaas_subscription_id,
        tenant.id,
        nextTier,
      );

      const clearsPending = preview.direction !== 'downgrade';
      const updated = await this.requireSubscriptionUpdate(tenant.id, {
        subscriptionStatus: tenant.subscription_status,
        ...(clearsPending ? { planTier: nextTier } : {}),
        pendingPlanTier: clearsPending ? null : nextTier,
        pendingPlanPaymentId: null,
        pendingPlanInvoiceUrl: null,
        pendingPlanEffectiveAt: clearsPending
          ? null
          : tenant.subscription_expires_at,
      });

      return this.toChangePlanResult(updated, preview, {
        invoiceUrl: null,
        applied: clearsPending,
      });
    }

    if (!tenant.asaas_customer_id) {
      throw new BadRequestException(
        'Não encontramos um cliente Asaas para este estabelecimento.',
      );
    }

    let payment: AsaasPayment;

    try {
      payment = await this.asaasClient.createPayment({
        customer: tenant.asaas_customer_id,
        billingType: 'UNDEFINED',
        value: preview.chargeAmountBrl,
        dueDate: toAsaasDate(new Date()),
        description: `Diferença de plano ${planTierLabel(tenant.plan_tier)} para ${planTierLabel(nextTier)}`,
        externalReference: buildPlanUpgradeExternalReference(tenant.id, nextTier),
      });
    } catch (error) {
      this.rethrowAsaasError(
        error,
        'Não foi possível criar a cobrança da diferença de plano.',
      );
    }

    const invoiceUrl = payment.invoiceUrl?.trim() || null;

    if (!invoiceUrl) {
      await this.deletePaymentBestEffort(payment.id);
      throw new InternalServerErrorException(
        'O Asaas não devolveu o link da cobrança da diferença de plano.',
      );
    }

    const updated = await this.requireSubscriptionUpdate(tenant.id, {
      subscriptionStatus: tenant.subscription_status,
      pendingPlanTier: nextTier,
      pendingPlanPaymentId: payment.id,
      pendingPlanInvoiceUrl: invoiceUrl,
      pendingPlanEffectiveAt: null,
    });

    return this.toChangePlanResult(updated, preview, {
      invoiceUrl,
      applied: false,
    });
  }

  /**
   * Cancels a scheduled downgrade or pending upgrade payment and restores the
   * current plan value on Asaas (B7 — Desfazer troca).
   */
  async cancelPendingPlanChange(tenantId: string): Promise<ChangePlanResult> {
    this.ensureAsaasOutbound('subscriptions.update');

    const tenant = await this.requireTenant(tenantId);

    if (!tenant.pending_plan_tier && !tenant.pending_plan_payment_id) {
      throw new BadRequestException('Não há troca de plano pendente.');
    }

    if (tenant.pending_plan_payment_id) {
      await this.deletePaymentBestEffort(tenant.pending_plan_payment_id);
    }

    if (tenant.asaas_subscription_id) {
      return this.restoreCurrentPlanPrice(tenant);
    }

    const updated = await this.requireSubscriptionUpdate(tenant.id, {
      subscriptionStatus: tenant.subscription_status,
      pendingPlanTier: null,
      pendingPlanPaymentId: null,
      pendingPlanInvoiceUrl: null,
      pendingPlanEffectiveAt: null,
    });

    return this.toChangePlanResult(
      updated,
      this.buildChangePlanPreview(updated, normalizePlanTier(updated.plan_tier)),
      { invoiceUrl: null, applied: true },
    );
  }

  async cancelSubscription(tenantId: string): Promise<Tenant> {
    this.ensureAsaasOutbound('subscriptions.delete');

    const tenant = await this.requireTenant(tenantId);

    if (!tenant.asaas_subscription_id && !tenant.support_ai_asaas_subscription_id) {
      throw new BadRequestException('Não há assinatura Asaas para cancelar.');
    }

    await this.cancelSupportAiSubscription(tenant);

    if (!tenant.asaas_subscription_id) {
      return (await this.tenantsService.findById(tenant.id)) ?? tenant;
    }

    if (isComplimentaryAccessActive(tenant)) {
      await this.deleteFutureUnpaidSubscriptionPayments(tenant.asaas_subscription_id);
      await this.deletePlanSubscriptionOrThrow(tenant.asaas_subscription_id);
      const updated = await this.tenantsService.updateSubscriptionByTenantId(
        tenant.id,
        {
          subscriptionStatus:
            tenant.subscription_status === 'ACTIVE'
              ? 'INACTIVE'
              : tenant.subscription_status,
          asaasSubscriptionId: null,
          asaasPendingPaymentId: null,
          subscriptionCancelAt: null,
        },
      );

      return updated ?? tenant;
    }

    if (tenant.subscription_cancel_at && this.hasCurrentPaidPeriod(tenant)) {
      return (await this.tenantsService.findById(tenant.id)) ?? tenant;
    }

    if (this.hasCurrentPaidPeriod(tenant)) {
      return this.scheduleCancelAtPeriodEnd(tenant);
    }

    return this.cancelPlanAccessNow(tenant);
  }

  async reactivateSubscription(tenantId: string): Promise<Tenant> {
    this.ensureAsaasOutbound('subscriptions.create');

    const tenant = await this.requireTenant(tenantId);

    if (!tenant.subscription_cancel_at) {
      throw new BadRequestException(
        'Não há cancelamento agendado para reativar.',
      );
    }

    if (!this.hasCurrentPaidPeriod(tenant) || !tenant.subscription_expires_at) {
      await this.expireScheduledCancellation(tenant);
      throw new BadRequestException(
        'O período pago já terminou. Assine novamente para continuar.',
      );
    }

    if (!tenant.asaas_customer_id) {
      throw new BadRequestException(
        'Não encontramos um cliente Asaas para este estabelecimento.',
      );
    }

    const planTier = normalizePlanTier(tenant.plan_tier);
    // Scheduled downgrade keeps the current plan until effective_at, but Asaas
    // already charges the lower tier — recreate the subscription at that price.
    const asaasPlanTier =
      tenant.pending_plan_tier && !tenant.pending_plan_payment_id
        ? normalizePlanTier(tenant.pending_plan_tier)
        : planTier;
    const value = resolvePlanValueBrl(this.configService, asaasPlanTier);
    let subscription: AsaasSubscription;

    try {
      subscription = await this.asaasClient.createSubscription({
        customer: tenant.asaas_customer_id,
        billingType: 'UNDEFINED',
        value,
        nextDueDate: toAsaasDate(new Date(tenant.subscription_expires_at)),
        cycle: 'MONTHLY',
        description: `Horário Certo ${asaasPlanTier}`,
        externalReference: buildPlanExternalReference(tenant.id, asaasPlanTier),
      });
    } catch (error) {
      this.rethrowAsaasError(
        error,
        'Não foi possível reativar a assinatura no Asaas.',
      );
    }

    try {
      return await this.requireSubscriptionUpdate(tenant.id, {
        subscriptionStatus: 'ACTIVE',
        asaasCustomerId: tenant.asaas_customer_id,
        asaasSubscriptionId: subscription.id,
        asaasPendingPaymentId: null,
        asaasOpenInvoiceUrl: null,
        subscriptionCancelAt: null,
        planTier,
      });
    } catch (error) {
      await this.deleteAsaasSubscriptionBestEffort(subscription.id);
      throw error;
    }
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
        subscriptionExpiresAt: laterIsoInstant(
          tenant.subscription_expires_at,
          (payment ? this.periodEndFromPaidCharge(payment) : null) ??
            this.nextDueDateToIso(subscription.nextDueDate),
        ),
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
  ): Promise<{ url: string; checkoutId: string | null }> {
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
    const checkoutItem = buildDepositCheckoutItemCopy(params.tenantName);

    try {
      const checkout = await this.asaasClient.createCheckout({
        billingTypes: ['PIX', 'CREDIT_CARD'],
        chargeTypes: ['DETACHED'],
        minutesToExpire: 30,
        callback: { successUrl, cancelUrl },
        items: [
          {
            name: checkoutItem.name,
            description: checkoutItem.description,
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

      return {
        url: checkout.link,
        checkoutId: checkout.id?.trim() || null,
      };
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
    const canChargeDeposits = tenantCanChargeDeposits(tenant);

    return {
      accountId,
      walletId,
      accountStatus: tenant.asaas_account_status,
      chargesEnabled,
      detailsSubmitted,
      isReady,
      canChargeDeposits,
      onboardingRequired: !walletId || !chargesEnabled,
      applicationFeePercent:
        this.resolveDepositApplicationFeePercentForTenant(tenant),
      canOpenDashboard: isReady,
    };
  }

  async getConnectStatus(tenantId: string): Promise<AsaasAccountStatusResponse> {
    const tenant = await this.requireTenant(tenantId);
    const onboarding = await this.resolveOnboardingSteps(tenant);

    return {
      ...this.buildAsaasAccountStatus(tenant),
      onboardingTitle: onboarding.title,
      onboardingSteps: onboarding.steps,
    };
  }

  async cancelAbandonedDepositCharges(
    targets: Array<{ appointmentId: string }>,
  ): Promise<void> {
    if (targets.length === 0 || !this.isAsaasOutboundEnabled()) {
      return;
    }

    for (const target of targets) {
      const appointmentId = target.appointmentId.trim();

      if (!appointmentId) {
        continue;
      }

      try {
        const { data } = await this.supabaseService
          .getClient()
          .from('appointments')
          .select('asaas_checkout_id, asaas_payment_id')
          .eq('id', appointmentId)
          .maybeSingle();
        const checkoutId =
          typeof data?.asaas_checkout_id === 'string'
            ? data.asaas_checkout_id.trim()
            : '';
        const paymentId =
          typeof data?.asaas_payment_id === 'string'
            ? data.asaas_payment_id.trim()
            : '';

        if (checkoutId) {
          await this.asaasClient.cancelCheckout(checkoutId);
        }

        if (paymentId) {
          await this.asaasClient.deletePayment(paymentId);
        }

        const listed = await this.asaasClient.listPayments({
          externalReference: buildDepositExternalReference(appointmentId),
          limit: 20,
        });

        for (const payment of listed.data ?? []) {
          const status = payment.status ?? '';

          if (payment.id && (status === 'PENDING' || status === 'OVERDUE')) {
            await this.asaasClient.deletePayment(payment.id);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        this.logger.warn(
          `Could not cancel the Asaas deposit charge for appointment ${appointmentId}: ${message}`,
        );
      }
    }
  }

  async getBillingStatus(tenantId: string): Promise<BillingStatusResponse> {
    const tenant = await this.requireTenant(tenantId);
    const currentTier = normalizePlanTier(tenant.plan_tier);
    const soloMonthlyValueBrl = resolvePlanValueBrl(this.configService, 'SOLO');
    const currentMonthlyValueBrl = resolvePlanValueBrl(
      this.configService,
      currentTier,
    );
    const canChargeDeposits = tenantCanChargeDeposits(tenant);
    const servicesRequiringDeposit =
      await this.countActiveServicesRequiringDeposit(tenant.id);
    const alertActive = servicesRequiringDeposit > 0 && !canChargeDeposits;
    const alreadyScheduled =
      tenant.pending_plan_tier === 'SOLO' && !tenant.pending_plan_payment_id;
    const available =
      currentTier !== 'SOLO' &&
      this.hasCurrentPaidPeriod(tenant) &&
      !tenant.subscription_cancel_at &&
      !tenant.pending_plan_payment_id &&
      !alreadyScheduled &&
      currentMonthlyValueBrl > soloMonthlyValueBrl;

    return {
      planTier: currentTier,
      subscriptionStatus: tenant.subscription_status,
      subscriptionExpiresAt: tenant.subscription_expires_at,
      subscriptionCancelAt: tenant.subscription_cancel_at ?? null,
      cancelAtPeriodEnd: Boolean(tenant.subscription_cancel_at),
      pendingPlanTier: tenant.pending_plan_tier ?? null,
      pendingPlanPaymentId: tenant.pending_plan_payment_id ?? null,
      pendingPlanInvoiceUrl: tenant.pending_plan_invoice_url ?? null,
      pendingPlanEffectiveAt: tenant.pending_plan_effective_at ?? null,
      canChargeDeposits,
      depositChargeAlert: {
        active: alertActive,
        message: alertActive ? DEPOSIT_CHARGE_ALERT_MESSAGE : null,
      },
      retentionOffer: {
        targetPlanTier: 'SOLO',
        monthlyValueBrl: soloMonthlyValueBrl,
        available,
        alreadyScheduled,
        effectiveAt:
          available || alreadyScheduled
            ? (tenant.pending_plan_effective_at ??
              tenant.subscription_expires_at)
            : null,
      },
    };
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

    const cpfCnpj = normalizeAsaasCpfCnpj(payload.cpfCnpj);
    const { birthDate, companyType, ...accountFields } = payload;

    if (cpfCnpj.length === 11 && !birthDate?.trim()) {
      throw new BadRequestException(
        'É necessário informar a data de nascimento (birthDate) no formato AAAA-MM-DD para CPF.',
      );
    }

    if (cpfCnpj.length === 14 && !companyType) {
      throw new BadRequestException(
        'É necessário informar o tipo de empresa (companyType: MEI, LIMITED, INDIVIDUAL ou ASSOCIATION) para CNPJ.',
      );
    }

    const subaccountKeySecret = this.getSubaccountKeyEncryptionSecret();

    try {
      const account = await this.asaasClient.createAccount({
        ...accountFields,
        cpfCnpj,
        postalCode: payload.postalCode.replace(/\D/g, ''),
        ...(cpfCnpj.length === 11 ? { birthDate: birthDate!.trim() } : {}),
        ...(cpfCnpj.length === 14 ? { companyType } : {}),
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

      const apiKey = account.apiKey?.trim();

      if (apiKey) {
        await this.tenantsService.saveAsaasSubaccountApiKey(
          tenant.id,
          encryptAsaasSubaccountApiKey(apiKey, subaccountKeySecret),
        );
      }

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
      const subaccountKey = await this.readSubaccountApiKey(tenant.id);

      if (subaccountKey) {
        const status = await this.asaasClient.getMyAccountStatus(subaccountKey);
        const patch = mapAsaasAccountStatusUpdate({
          general: status.general,
          commercialInfo: status.commercialInfo,
          bankAccountInfo: status.bankAccountInfo,
          documentation: status.documentation,
        });

        if (!patch) {
          this.logger.warn(
            `Asaas account ${tenant.asaas_account_id} returned no general status. Local charges flag was kept.`,
          );
          return tenant;
        }

        return this.tenantsService.updateAsaasAccountStatus(tenant.id, patch);
      }

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

  @Cron('15 8 * * *', { timeZone: APP_TIME_ZONE })
  async markPastDueAfterGrace(): Promise<void> {
    const now = new Date();
    await this.applyScheduledBillingChanges(now);

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

    for (const row of data ?? []) {
      const tenant = row as Tenant;

      if (tenant.subscription_cancel_at) {
        if (
          (parseUtcInstant(tenant.subscription_cancel_at)?.getTime() ??
            Number.POSITIVE_INFINITY) <= now.getTime()
        ) {
          await this.expireScheduledCancellation(tenant);
        }
        continue;
      }

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

  private getSubaccountKeyEncryptionSecret(): string {
    const secret = this.configService
      .get<string>('ASAAS_SUBACCOUNT_KEY_ENCRYPTION_KEY')
      ?.trim();

    if (!secret) {
      throw new InternalServerErrorException(
        'ASAAS_SUBACCOUNT_KEY_ENCRYPTION_KEY is not configured',
      );
    }

    return secret;
  }

  private async resolveOnboardingSteps(tenant: Tenant) {
    const hasAccount = Boolean(tenant.asaas_account_id?.trim());
    let commercialInfo: string | null = null;
    let bankAccountInfo: string | null = null;
    let documentation: string | null = null;
    let general = tenant.asaas_account_status;

    if (hasAccount && this.isAsaasOutboundEnabled()) {
      try {
        const subaccountKey = await this.readSubaccountApiKey(tenant.id);

        if (subaccountKey) {
          const status =
            await this.asaasClient.getMyAccountStatus(subaccountKey);
          commercialInfo = status.commercialInfo ?? null;
          bankAccountInfo = status.bankAccountInfo ?? null;
          documentation = status.documentation ?? null;
          general = status.general ?? general;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        this.logger.warn(
          `Could not read Asaas onboarding steps for tenant ${tenant.id}: ${message}`,
        );
      }
    }

    return buildAsaasOnboardingSteps({
      hasAccount,
      commercialInfo,
      bankAccountInfo,
      documentation,
      general,
    });
  }

  private async readSubaccountApiKey(tenantId: string): Promise<string | null> {
    const ciphertext =
      await this.tenantsService.findAsaasSubaccountApiKeyCiphertext(tenantId);

    if (!ciphertext) {
      return null;
    }

    const secret = this.configService
      .get<string>('ASAAS_SUBACCOUNT_KEY_ENCRYPTION_KEY')
      ?.trim();

    if (!secret) {
      this.logger.warn(
        `Tenant ${tenantId} has an encrypted Asaas subaccount key but ASAAS_SUBACCOUNT_KEY_ENCRYPTION_KEY is not configured. Sync kept the legacy account lookup.`,
      );
      return null;
    }

    try {
      return decryptAsaasSubaccountApiKey(ciphertext, secret);
    } catch {
      this.logger.warn(
        `Tenant ${tenantId} has an Asaas subaccount key that could not be decrypted. Sync kept the legacy account lookup.`,
      );
      return null;
    }
  }

  /**
   * Reabre a fatura de uma assinatura Asaas já criada e ainda não paga.
   * Retorna null quando não há fatura em aberto (já paga ou inexistente),
   * sem escrever no Asaas. Só atualiza valor/plano depois de confirmar a fatura.
   */
  private async resumePendingSubscription(
    tenant: Tenant,
    planTier: PlanTier,
  ): Promise<CheckoutSessionResponse | null> {
    const subscriptionId = tenant.asaas_subscription_id?.trim();

    if (!subscriptionId) {
      throw new BadRequestException(
        'Não encontramos a assinatura pendente deste estabelecimento.',
      );
    }

    const pendingPayment = await this.findOpenSubscriptionPayment(subscriptionId);
    const invoiceUrl = pendingPayment?.invoiceUrl?.trim();

    if (!invoiceUrl) {
      return null;
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
      !isIsoInstantAfter(subscriptionExpiresAt, tenant.subscription_expires_at)
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

  private async handlePlanUpgradePaymentEvent(
    type: string,
    payment: AsaasPayment,
  ): Promise<void> {
    const ref = parsePlanUpgradeExternalReference(payment.externalReference);

    if (!ref) {
      return;
    }

    const tenant = await this.tenantsService.findById(ref.tenantId);

    if (!tenant) {
      this.logger.warn(
        `Plan upgrade payment ${payment.id} without tenant ${ref.tenantId}`,
      );
      return;
    }

    if (type === 'PAYMENT_CONFIRMED' || type === 'PAYMENT_RECEIVED') {
      await this.applyPaidPlanUpgrade(tenant, ref.planTier, payment);
      return;
    }

    if (
      type === 'PAYMENT_OVERDUE' ||
      type === 'PAYMENT_DELETED' ||
      type === 'PAYMENT_REFUNDED'
    ) {
      if (tenant.pending_plan_payment_id !== payment.id) {
        return;
      }

      await this.clearPendingPlan(tenant);
      this.logger.log(
        `Cleared pending plan upgrade for tenant ${tenant.id} after ${type} on ${payment.id}`,
      );
    }
  }

  /**
   * Applies the target tier after the difference is paid and updates the next
   * Asaas cycles. Affiliate commission stays on the full subscription invoice,
   * not on this prorated difference.
   */
  private async applyPaidPlanUpgrade(
    tenant: Tenant,
    target: PlanTier,
    payment: AsaasPayment,
  ): Promise<void> {
    if (
      tenant.pending_plan_payment_id &&
      tenant.pending_plan_payment_id !== payment.id
    ) {
      this.logger.warn(
        `Ignoring plan upgrade payment ${payment.id} for tenant ${tenant.id}; pending payment is ${tenant.pending_plan_payment_id}`,
      );
      return;
    }

    const alreadyApplied =
      normalizePlanTier(tenant.plan_tier) === target &&
      !tenant.pending_plan_payment_id &&
      !tenant.pending_plan_tier;

    if (alreadyApplied) {
      return;
    }

    if (tenant.asaas_subscription_id) {
      await this.updateAsaasPlanValue(
        tenant.asaas_subscription_id,
        tenant.id,
        target,
      );
    }

    await this.requireSubscriptionUpdate(tenant.id, {
      subscriptionStatus: tenant.subscription_status,
      planTier: target,
      pendingPlanTier: null,
      pendingPlanPaymentId: null,
      pendingPlanInvoiceUrl: null,
      pendingPlanEffectiveAt: null,
    });

    this.logger.log(
      `Plan upgrade applied: tenant=${tenant.id} payment=${payment.id} plan_tier=${target}`,
    );
  }

  private resolveDuePlanDowngrade(
    tenant: Tenant,
    payment: AsaasPayment,
  ): { planTier: PlanTier | null; clearPending: boolean } {
    if (!tenant.pending_plan_tier || tenant.pending_plan_payment_id) {
      return { planTier: null, clearPending: false };
    }

    if (this.isScheduledDowngradeDue(tenant, payment.dueDate)) {
      return { planTier: tenant.pending_plan_tier, clearPending: true };
    }

    return { planTier: tenant.plan_tier, clearPending: false };
  }

  private isScheduledDowngradeDue(
    tenant: Tenant,
    dueDate?: string | null,
  ): boolean {
    const effective = parseUtcInstant(tenant.pending_plan_effective_at);

    if (!effective) {
      return true;
    }

    if (Date.now() >= effective.getTime()) {
      return true;
    }

    const due = dueDate?.trim().slice(0, 10) ?? '';
    return Boolean(due && due >= toAsaasDate(effective));
  }

  private async applyScheduledBillingChanges(now: Date): Promise<void> {
    await this.expireDueScheduledCancellations(now);
    await this.applyDueScheduledDowngrades(now);
  }

  private async expireDueScheduledCancellations(now: Date): Promise<void> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select('*')
      .not('subscription_cancel_at', 'is', null)
      .lte('subscription_cancel_at', now.toISOString());

    if (error) {
      this.logger.error(
        `Failed to load scheduled cancellations: ${error.message}`,
      );
      return;
    }

    for (const row of data ?? []) {
      const tenant = row as Tenant;
      const cancelAt = parseUtcInstant(tenant.subscription_cancel_at);

      if (!cancelAt || cancelAt.getTime() > now.getTime()) {
        continue;
      }

      await this.expireScheduledCancellation(tenant);
    }
  }

  private async applyDueScheduledDowngrades(now: Date): Promise<void> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select('*')
      .not('pending_plan_effective_at', 'is', null)
      .lte('pending_plan_effective_at', now.toISOString())
      .is('pending_plan_payment_id', null);

    if (error) {
      this.logger.error(`Failed to load scheduled downgrades: ${error.message}`);
      return;
    }

    for (const row of data ?? []) {
      const tenant = row as Tenant;

      if (
        !tenant.pending_plan_tier ||
        tenant.pending_plan_payment_id ||
        tenant.subscription_cancel_at
      ) {
        continue;
      }

      const effective = parseUtcInstant(tenant.pending_plan_effective_at);

      if (!effective || effective.getTime() > now.getTime()) {
        continue;
      }

      await this.tenantsService.updateSubscriptionByTenantId(tenant.id, {
        subscriptionStatus: tenant.subscription_status,
        planTier: tenant.pending_plan_tier,
        pendingPlanTier: null,
        pendingPlanPaymentId: null,
        pendingPlanInvoiceUrl: null,
        pendingPlanEffectiveAt: null,
      });
      this.logger.log(
        `Applied scheduled downgrade: tenant=${tenant.id} plan_tier=${tenant.pending_plan_tier}`,
      );
    }
  }

  private async applyDueScheduledDowngradeIfNeeded(
    tenant: Tenant,
  ): Promise<Tenant> {
    if (
      !tenant.pending_plan_tier ||
      tenant.pending_plan_payment_id ||
      !this.isScheduledDowngradeDue(tenant, null)
    ) {
      return tenant;
    }

    const updated = await this.tenantsService.updateSubscriptionByTenantId(
      tenant.id,
      {
        subscriptionStatus: tenant.subscription_status,
        planTier: tenant.pending_plan_tier,
        pendingPlanTier: null,
        pendingPlanPaymentId: null,
        pendingPlanInvoiceUrl: null,
        pendingPlanEffectiveAt: null,
      },
    );

    return updated ?? tenant;
  }

  private async expireScheduledCancellation(tenant: Tenant): Promise<Tenant | null> {
    const updated = await this.tenantsService.updateSubscriptionByTenantId(
      tenant.id,
      {
        subscriptionStatus: 'PAST_DUE',
        asaasSubscriptionId: null,
        asaasPendingPaymentId: null,
        asaasOpenInvoiceUrl: null,
        subscriptionCancelAt: null,
        pendingPlanTier: null,
        pendingPlanPaymentId: null,
        pendingPlanInvoiceUrl: null,
        pendingPlanEffectiveAt: null,
      },
    );
    this.logger.log(
      `Scheduled cancellation ended: tenant=${tenant.id} status=PAST_DUE plan_tier=${tenant.plan_tier}`,
    );
    return updated;
  }

  private async scheduleCancelAtPeriodEnd(tenant: Tenant): Promise<Tenant> {
    const cancelAt = tenant.subscription_expires_at;

    if (!cancelAt || !tenant.asaas_subscription_id) {
      throw new BadRequestException(
        'Não foi possível determinar o fim do período pago.',
      );
    }

    await this.requireSubscriptionUpdate(tenant.id, {
      subscriptionStatus: tenant.subscription_status,
      subscriptionCancelAt: cancelAt,
    });

    try {
      if (tenant.pending_plan_payment_id) {
        await this.deletePaymentBestEffort(tenant.pending_plan_payment_id);
      }

      await this.deleteFutureUnpaidSubscriptionPayments(
        tenant.asaas_subscription_id,
      );
      await this.deletePlanSubscriptionOrThrow(tenant.asaas_subscription_id);
    } catch (error) {
      await this.tenantsService.updateSubscriptionByTenantId(tenant.id, {
        subscriptionStatus: tenant.subscription_status,
        subscriptionCancelAt: null,
      });
      this.rethrowAsaasError(
        error,
        'Não foi possível cancelar a assinatura no Asaas.',
      );
    }

    // Keep a scheduled downgrade (pending_plan_tier without payment). Only clear
    // pending upgrade invoices that were deleted above.
    const clearsPendingUpgrade = Boolean(tenant.pending_plan_payment_id);

    return this.requireSubscriptionUpdate(tenant.id, {
      subscriptionStatus: tenant.subscription_status,
      subscriptionCancelAt: cancelAt,
      ...(clearsPendingUpgrade
        ? {
            pendingPlanTier: null,
            pendingPlanPaymentId: null,
            pendingPlanInvoiceUrl: null,
            pendingPlanEffectiveAt: null,
          }
        : {}),
    });
  }

  private async cancelPlanAccessNow(tenant: Tenant): Promise<Tenant> {
    if (!tenant.asaas_subscription_id) {
      return tenant;
    }

    await this.requireSubscriptionUpdate(tenant.id, {
      subscriptionStatus: tenant.subscription_status,
      subscriptionCancelAt: new Date().toISOString(),
    });

    try {
      if (tenant.pending_plan_payment_id) {
        await this.deletePaymentBestEffort(tenant.pending_plan_payment_id);
      }

      await this.deleteFutureUnpaidSubscriptionPayments(
        tenant.asaas_subscription_id,
      );
      await this.deletePlanSubscriptionOrThrow(tenant.asaas_subscription_id);
    } catch (error) {
      await this.tenantsService.updateSubscriptionByTenantId(tenant.id, {
        subscriptionStatus: tenant.subscription_status,
        subscriptionCancelAt: null,
      });
      this.rethrowAsaasError(
        error,
        'Não foi possível cancelar a assinatura no Asaas.',
      );
    }

    const nextStatus =
      tenant.subscription_status === 'ACTIVE'
        ? 'PAST_DUE'
        : tenant.subscription_status;

    return this.requireSubscriptionUpdate(tenant.id, {
      subscriptionStatus: nextStatus,
      asaasSubscriptionId: null,
      asaasPendingPaymentId: null,
      asaasOpenInvoiceUrl: null,
      subscriptionCancelAt: null,
      pendingPlanTier: null,
      pendingPlanPaymentId: null,
      pendingPlanInvoiceUrl: null,
      pendingPlanEffectiveAt: null,
    });
  }

  private async cancelSupportAiSubscription(tenant: Tenant): Promise<void> {
    if (!tenant.support_ai_asaas_subscription_id) {
      return;
    }

    await this.deleteAsaasSubscriptionBestEffort(
      tenant.support_ai_asaas_subscription_id,
    );
    await this.tenantsService.updateSupportAiEntitlement(tenant.id, {
      supportAiEnabled: false,
      supportAiAsaasSubscriptionId: null,
      supportAiStatus: 'canceled',
    });
  }

  private async deleteFutureUnpaidSubscriptionPayments(
    subscriptionId: string,
  ): Promise<void> {
    let payments: AsaasPayment[] = [];

    try {
      const listed = await this.asaasClient.listPayments({
        subscription: subscriptionId,
        limit: 100,
      });
      payments = listed.data ?? [];
    } catch (error) {
      this.logger.warn(
        `Could not list open payments for subscription ${subscriptionId}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      return;
    }

    const today = toAsaasDate(new Date());

    for (const payment of payments) {
      const status = (payment.status ?? '').toUpperCase();

      if (status !== 'PENDING' && status !== 'OVERDUE') {
        continue;
      }

      const due = payment.dueDate?.trim().slice(0, 10) ?? '';

      if (due && due <= today) {
        continue;
      }

      await this.deletePaymentBestEffort(payment.id);
    }
  }

  private async deletePlanSubscriptionOrThrow(
    subscriptionId: string,
  ): Promise<void> {
    try {
      await this.asaasClient.deleteSubscription(subscriptionId);
    } catch (error) {
      if (error instanceof AsaasHttpError && error.statusCode === 404) {
        return;
      }

      throw error;
    }
  }

  private async deleteAsaasSubscriptionBestEffort(
    subscriptionId: string,
  ): Promise<void> {
    try {
      await this.asaasClient.deleteSubscription(subscriptionId);
    } catch (error) {
      this.logger.warn(
        `Failed to cancel Asaas subscription ${subscriptionId}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }

  private async deletePaymentBestEffort(paymentId: string): Promise<void> {
    try {
      await this.asaasClient.deletePayment(paymentId);
    } catch (error) {
      this.logger.warn(
        `Failed to delete Asaas payment ${paymentId}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }

  private hasCurrentPaidPeriod(tenant: Tenant, now = new Date()): boolean {
    if (tenant.subscription_status !== 'ACTIVE') {
      return false;
    }

    const expires = parseUtcInstant(tenant.subscription_expires_at);
    return Boolean(expires && expires.getTime() > now.getTime());
  }

  private buildChangePlanPreview(
    tenant: Tenant,
    target: PlanTier,
  ): ChangePlanPreview {
    const currentTier = normalizePlanTier(tenant.plan_tier);
    const currentMonthlyValueBrl = resolvePlanValueBrl(
      this.configService,
      currentTier,
    );
    const targetMonthlyValueBrl = resolvePlanValueBrl(
      this.configService,
      target,
    );
    const paid = this.hasCurrentPaidPeriod(tenant);
    const dates =
      paid && tenant.subscription_expires_at
        ? paidPeriodDates(tenant.subscription_expires_at, new Date())
        : null;
    const quote = quotePlanChange({
      currentMonthlyValueBrl,
      targetMonthlyValueBrl,
      periodStartDate: dates?.periodStartDate,
      periodEndDate: dates?.periodEndDate,
      todayDate: dates?.todayDate,
    });
    const nowIso = new Date().toISOString();
    let effectiveAt: string | null = null;
    let appliesImmediately = false;

    if (!paid && quote.direction !== 'same') {
      effectiveAt = nowIso;
      appliesImmediately = true;
    } else if (quote.direction === 'downgrade') {
      effectiveAt = tenant.subscription_expires_at;
    } else if (quote.direction === 'upgrade' && quote.chargeAmountBrl <= 0) {
      effectiveAt = nowIso;
      appliesImmediately = true;
    }

    return {
      direction: quote.direction,
      currentPlanTier: currentTier,
      targetPlanTier: target,
      currentMonthlyValueBrl: quote.currentMonthlyValueBrl,
      targetMonthlyValueBrl: quote.targetMonthlyValueBrl,
      proratedAmountBrl: paid ? quote.proratedAmountBrl : null,
      chargeAmountBrl: paid ? quote.chargeAmountBrl : 0,
      belowAsaasMinimum: paid ? quote.belowAsaasMinimum : false,
      minimumChargeBrl: ASAAS_MIN_CHARGE_BRL,
      effectiveAt,
      appliesImmediately,
    };
  }

  private toChangePlanResult(
    tenant: Tenant,
    preview: ChangePlanPreview,
    extra: { invoiceUrl: string | null; applied: boolean },
  ): ChangePlanResult {
    return {
      ...preview,
      tenant,
      invoiceUrl: extra.invoiceUrl,
      applied: extra.applied,
    };
  }

  private async applyPlanValueNow(
    tenant: Tenant,
    nextTier: PlanTier,
  ): Promise<Tenant> {
    if (!tenant.asaas_subscription_id) {
      throw new BadRequestException(
        'Você precisa de uma assinatura ativa para trocar de plano.',
      );
    }

    await this.updateAsaasPlanValue(
      tenant.asaas_subscription_id,
      tenant.id,
      nextTier,
    );

    return this.requireSubscriptionUpdate(tenant.id, {
      subscriptionStatus: tenant.subscription_status,
      planTier: nextTier,
      pendingPlanTier: null,
      pendingPlanPaymentId: null,
      pendingPlanInvoiceUrl: null,
      pendingPlanEffectiveAt: null,
    });
  }

  private async restoreCurrentPlanPrice(tenant: Tenant): Promise<ChangePlanResult> {
    if (!tenant.asaas_subscription_id) {
      throw new BadRequestException(
        'Você precisa de uma assinatura ativa para trocar de plano.',
      );
    }

    const currentTier = normalizePlanTier(tenant.plan_tier);
    await this.updateAsaasPlanValue(
      tenant.asaas_subscription_id,
      tenant.id,
      currentTier,
    );
    const updated = await this.requireSubscriptionUpdate(tenant.id, {
      subscriptionStatus: tenant.subscription_status,
      pendingPlanTier: null,
      pendingPlanPaymentId: null,
      pendingPlanInvoiceUrl: null,
      pendingPlanEffectiveAt: null,
    });

    return this.toChangePlanResult(
      updated,
      this.buildChangePlanPreview(updated, currentTier),
      { invoiceUrl: null, applied: true },
    );
  }

  private async updateAsaasPlanValue(
    subscriptionId: string,
    tenantId: string,
    planTier: PlanTier,
  ): Promise<void> {
    const value = resolvePlanValueBrl(this.configService, planTier);

    try {
      await this.asaasClient.updateSubscription(subscriptionId, {
        value,
        description: `Horário Certo ${planTier}`,
        externalReference: buildPlanExternalReference(tenantId, planTier),
        updatePendingPayments: true,
      });
    } catch (error) {
      this.rethrowAsaasError(
        error,
        'Não foi possível atualizar o plano no Asaas.',
      );
    }
  }

  private async clearPendingPlan(tenant: Tenant): Promise<void> {
    await this.tenantsService.updateSubscriptionByTenantId(tenant.id, {
      subscriptionStatus: tenant.subscription_status,
      pendingPlanTier: null,
      pendingPlanPaymentId: null,
      pendingPlanInvoiceUrl: null,
      pendingPlanEffectiveAt: null,
    });
  }

  private async requireSubscriptionUpdate(
    tenantId: string,
    payload: Parameters<TenantsService['updateSubscriptionByTenantId']>[1],
  ): Promise<Tenant> {
    const updated = await this.tenantsService.updateSubscriptionByTenantId(
      tenantId,
      payload,
    );

    if (!updated) {
      throw new InternalServerErrorException(
        'Não foi possível gravar a assinatura.',
      );
    }

    return updated;
  }

  private async countActiveServicesRequiringDeposit(
    tenantId: string,
  ): Promise<number> {
    const { count, error } = await this.supabaseService
      .getClient()
      .from('services')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .eq('requires_deposit', true);

    if (error) {
      this.logger.warn(
        `Failed to count deposit services for tenant ${tenantId}: ${error.message}`,
      );
      return 0;
    }

    return count ?? 0;
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
