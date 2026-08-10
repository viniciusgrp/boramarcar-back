import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { PlanTier } from '../tenants/entities/plan-tier.type';
import type { SubscriptionStatus } from '../tenants/entities/subscription-status.type';
import type { Tenant } from '../tenants/entities/tenant.entity';
import { normalizePlanTier } from '../tenants/utils/plan-tier.util';
import { AppointmentsService } from '../appointments/appointments.service';
import { SupabaseService } from '../supabase/supabase.service';
import { TenantsService } from '../tenants/tenants.service';
import { CheckoutSessionResponse } from './entities/checkout-session-response.entity';
import type { StripeConnectStatusResponse } from './entities/stripe-connect-status.entity';
import { WebhookAckResponse } from './entities/webhook-ack-response.entity';
import type {
  StripeAccount,
  StripeCheckoutSession,
  StripeEvent,
  StripeSubscription,
} from './types/stripe-api.types';
import { findSubscriptionItemByPriceId } from './utils/extract-subscription-items.util';
import { extractSubscriptionPriceId } from './utils/extract-subscription-price-id.util';
import { mapStripeSubscriptionStatus } from './utils/map-stripe-subscription-status';
import type { SupportAiStatus } from '../tenants/entities/support-ai-status.type';
import {
  buildStripePriceTierMap,
  resolvePlanTierFromPriceId,
} from './utils/stripe-plan-tier.util';
import {
  extractSubscriptionPeriodEnd,
  stripePeriodEndToIso,
} from './utils/stripe-period-end.util';
import { extractStripeId } from './utils/stripe-id.util';
import { resolveSubscriptionTrialTransition } from './utils/subscription-trial-transition.util';
import { tenantHasManageableSubscription } from './utils/tenant-billing-access.util';
import {
  resolveConnectApplicationFeeAmount,
  resolveTenantDepositApplicationFeePercent,
} from './utils/deposit-application-fee.util';

export interface CreateCheckoutSessionParams {
  tenantId: string;
  tenantName: string;
  ownerEmail: string;
  planTier: PlanTier;
}

export interface CreateDepositCheckoutSessionParams {
  appointmentId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  depositAmountBrl: number;
  /** Capability token included in Stripe cancel_url for public hold release. */
  accessToken: string;
}

type StripeClient = InstanceType<typeof Stripe>;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: StripeClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly tenantsService: TenantsService,
    private readonly supabaseService: SupabaseService,
    @Inject(forwardRef(() => AppointmentsService))
    private readonly appointmentsService: AppointmentsService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');

    if (!secretKey?.trim()) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    this.stripe = new Stripe(secretKey);
  }

  async handleWebhook(
    signature: string | undefined,
    rawBody: Buffer | undefined,
  ): Promise<WebhookAckResponse> {
    if (!signature?.trim()) {
      throw new BadRequestException('Missing Stripe-Signature header');
    }

    if (!rawBody?.length) {
      throw new BadRequestException('Missing raw request body');
    }

    const webhookSecret = this.configService
      .get<string>('STRIPE_WEBHOOK_SECRET')
      ?.trim();

    if (!webhookSecret) {
      throw new InternalServerErrorException(
        'STRIPE_WEBHOOK_SECRET is not configured',
      );
    }

    let event: StripeEvent;

    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
    } catch (error) {
      this.logger.warn(
        `Stripe webhook signature verification failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    try {
      await this.handleStripeWebhook(event);
    } catch (error) {
      this.logger.error(
        `Stripe webhook processing failed for ${event.type}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error instanceof Error
        ? error
        : new InternalServerErrorException('Stripe webhook processing failed');
    }

    return { received: true };
  }

  async handleStripeWebhook(event: StripeEvent): Promise<void> {
    const claimed = await this.claimWebhookEvent(event.id, event.type);

    if (!claimed) {
      this.logger.debug(
        `Skipping already processed Stripe event ${event.id} (${event.type})`,
      );
      return;
    }

    try {
      await this.processWebhookEvent(event);
    } catch (error) {
      await this.releaseWebhookEventClaim(event.id);
      throw error;
    }
  }

  /**
   * Inserts the event id. Returns false when the event was already processed
   * (unique constraint), true when this worker claimed it.
   */
  private async claimWebhookEvent(
    eventId: string,
    eventType: string,
  ): Promise<boolean> {
    const { error } = await this.supabaseService
      .getClient()
      .from('stripe_webhook_events')
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
      `Failed to claim Stripe webhook event: ${error.message}`,
    );
  }

  private async releaseWebhookEventClaim(eventId: string): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from('stripe_webhook_events')
      .delete()
      .eq('event_id', eventId);

    if (error) {
      this.logger.error(
        `Failed to release Stripe webhook claim for ${eventId}: ${error.message}`,
      );
    }
  }

  private async processWebhookEvent(event: StripeEvent): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(event.data.object);
        break;
      case 'checkout.session.expired':
        await this.handleDepositCheckoutExpired(event.data.object);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;
      case 'account.updated':
        await this.handleConnectAccountUpdated(event.data.object);
        break;
      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  private resolvePlanTierFromStripePrice(
    priceId: string | null,
    options?: {
      metadataPlanTier?: string | null;
      allowMetadataFallback?: boolean;
      existingPlanTier?: PlanTier;
    },
  ): PlanTier {
    const priceMap = buildStripePriceTierMap(this.configService);
    const fromPrice = resolvePlanTierFromPriceId(priceId, priceMap);

    if (fromPrice) {
      return fromPrice;
    }

    if (options?.allowMetadataFallback && options.metadataPlanTier) {
      return normalizePlanTier(options.metadataPlanTier);
    }

    if (options?.existingPlanTier) {
      this.logger.warn(
        `Unable to map Stripe price "${priceId ?? 'unknown'}" to plan_tier; keeping ${options.existingPlanTier}`,
      );
      return options.existingPlanTier;
    }

    this.logger.warn(
      `Unable to map Stripe price "${priceId ?? 'unknown'}" to plan_tier; defaulting to SOLO`,
    );

    return 'SOLO';
  }

  private async handleDepositCheckoutCompleted(
    session: StripeCheckoutSession,
  ): Promise<void> {
    const checkoutType = session.metadata?.checkout_type;

    if (checkoutType !== 'appointment_deposit') {
      return;
    }

    const appointmentId = session.metadata?.appointment_id?.trim();

    if (!appointmentId) {
      this.logger.warn(
        'Deposit checkout.session.completed missing appointment_id metadata',
      );
      return;
    }

    const result =
      await this.appointmentsService.confirmDepositPaymentDetailed(
        appointmentId,
      );

    if (result.outcome === 'confirmed') {
      this.logger.log(
        `Deposit confirmed: appointment=${appointmentId} status=CONFIRMED payment_status=PAID`,
      );
      return;
    }

    if (result.outcome === 'already_confirmed') {
      this.logger.debug(
        `Deposit already confirmed for appointment ${appointmentId}`,
      );
      return;
    }

    if (result.outcome === 'late_payment_needs_refund') {
      await this.refundLateDepositPayment(session, appointmentId);
      return;
    }

    this.logger.warn(
      `Deposit payment received but appointment ${appointmentId} was not confirmable (outcome=${result.outcome})`,
    );
  }

  private async handleDepositCheckoutExpired(
    session: StripeCheckoutSession,
  ): Promise<void> {
    if (session.mode !== 'payment') {
      return;
    }

    const checkoutType = session.metadata?.checkout_type;

    if (checkoutType !== 'appointment_deposit') {
      return;
    }

    const appointmentId = session.metadata?.appointment_id?.trim();

    if (!appointmentId) {
      this.logger.warn(
        'Deposit checkout.session.expired missing appointment_id metadata',
      );
      return;
    }

    const released =
      await this.appointmentsService.releasePendingDepositHold(appointmentId);

    if (released) {
      this.logger.log(
        `Released pending deposit hold after checkout expiry: appointment=${appointmentId}`,
      );
    }
  }

  private async refundLateDepositPayment(
    session: StripeCheckoutSession,
    appointmentId: string,
  ): Promise<void> {
    const paymentIntentId = extractStripeId(session.payment_intent);

    if (!paymentIntentId) {
      this.logger.error(
        `Late deposit payment for ${appointmentId} has no payment_intent; cannot auto-refund`,
      );
      return;
    }

    try {
      await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
      });
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

  private resolveTenantIdFromCheckoutSession(
    session: StripeCheckoutSession,
  ): string | null {
    const metadataTenantId = session.metadata?.tenant_id?.trim();

    if (metadataTenantId) {
      return metadataTenantId;
    }

    const clientReferenceId = session.client_reference_id?.trim();

    return clientReferenceId || null;
  }

  async createDepositCheckoutSession(
    params: CreateDepositCheckoutSessionParams,
  ): Promise<string> {
    if (params.depositAmountBrl <= 0) {
      throw new BadRequestException('Deposit amount must be greater than zero');
    }

    const tenant = await this.tenantsService.findById(params.tenantId);

    if (!tenant) {
      throw new NotFoundException(
        `Tenant with id "${params.tenantId}" was not found`,
      );
    }

    const connectAccountId = tenant.stripe_connect_account_id?.trim();

    if (!connectAccountId || !tenant.stripe_connect_charges_enabled) {
      throw new BadRequestException(
        'Este estabelecimento ainda não configurou a conta Stripe para receber sinais.',
      );
    }

    const successBaseUrl = this.getRequiredUrl('STRIPE_DEPOSIT_SUCCESS_URL');
    const cancelBaseUrl = this.getRequiredUrl('STRIPE_DEPOSIT_CANCEL_URL');
    const successUrl = `${successBaseUrl}${successBaseUrl.includes('?') ? '&' : '?'}appointment_id=${params.appointmentId}&access_token=${encodeURIComponent(params.accessToken)}`;
    const cancelUrl = `${cancelBaseUrl}${cancelBaseUrl.includes('?') ? '&' : '?'}appointment_id=${params.appointmentId}&tenant_slug=${encodeURIComponent(params.tenantSlug)}&access_token=${encodeURIComponent(params.accessToken)}`;

    const unitAmountCents = Math.round(params.depositAmountBrl * 100);
    const applicationFeePercent =
      this.resolveConnectApplicationFeePercentForTenant(tenant);
    const applicationFeeAmount = resolveConnectApplicationFeeAmount(
      unitAmountCents,
      applicationFeePercent,
    );

    try {
      const session = await this.stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'brl',
              unit_amount: unitAmountCents,
              product_data: {
                name: `Sinal: ${params.tenantName}`,
                description: 'Pagamento antecipado para confirmar agendamento',
              },
            },
          },
        ],
        payment_intent_data: {
          ...(applicationFeeAmount > 0
            ? { application_fee_amount: applicationFeeAmount }
            : {}),
          transfer_data: {
            destination: connectAccountId,
          },
          metadata: {
            checkout_type: 'appointment_deposit',
            appointment_id: params.appointmentId,
            tenant_id: params.tenantId,
          },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          checkout_type: 'appointment_deposit',
          appointment_id: params.appointmentId,
          tenant_id: params.tenantId,
        },
      });

      if (!session.url) {
        throw new InternalServerErrorException(
          'Stripe did not return a checkout session URL',
        );
      }

      return session.url;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Não foi possível criar a sessão de pagamento do sinal no Stripe.',
      );
    }
  }

  private async handleCheckoutSessionCompleted(
    session: StripeCheckoutSession,
  ): Promise<void> {
    if (session.mode === 'payment') {
      await this.handleDepositCheckoutCompleted(session);
      return;
    }

    if (session.mode !== 'subscription') {
      return;
    }

    const stripeCustomerId = extractStripeId(session.customer);
    const stripeSubscriptionId = extractStripeId(session.subscription);
    const tenantId = this.resolveTenantIdFromCheckoutSession(session);

    if (!stripeCustomerId || !stripeSubscriptionId) {
      this.logger.warn(
        'checkout.session.completed missing customer or subscription id',
      );
      return;
    }

    const stripeSubscription = await this.stripe.subscriptions.retrieve(
      stripeSubscriptionId,
      { expand: ['items.data.price'] },
    );
    const subscriptionExpiresAt = stripePeriodEndToIso(
      extractSubscriptionPeriodEnd(stripeSubscription),
    );
    const priceId = extractSubscriptionPriceId(stripeSubscription, {
      excludePriceIds: this.getSupportAiPriceIdsToExclude(),
    });
    const planTier = this.resolvePlanTierFromStripePrice(priceId, {
      metadataPlanTier: session.metadata?.plan_tier,
      allowMetadataFallback: true,
    });

    const existingTenant = tenantId
      ? await this.tenantsService.findById(tenantId)
      : await this.tenantsService.findByStripeCustomerId(stripeCustomerId);
    const trialTransition = resolveSubscriptionTrialTransition(
      existingTenant,
      'ACTIVE',
    );

    const billingPayload = {
      stripeCustomerId,
      stripeSubscriptionId,
      subscriptionStatus: 'ACTIVE' as const,
      subscriptionExpiresAt,
      planTier,
      ...trialTransition,
    };

    let tenant = tenantId
      ? await this.tenantsService.updateSubscriptionByTenantId(
          tenantId,
          billingPayload,
        )
      : null;

    if (!tenant) {
      tenant = await this.tenantsService.updateSubscriptionByStripeCustomerId(
        stripeCustomerId,
        billingPayload,
      );
    }

    if (!tenant) {
      this.logger.warn(
        `No tenant found after checkout (customer=${stripeCustomerId}, tenantId=${tenantId ?? 'n/a'})`,
      );
    } else {
      this.logger.log(
        `Checkout completed: tenant=${tenant.id} plan_tier=${planTier} status=ACTIVE`,
      );
    }
  }

  private async handleSubscriptionUpdated(
    subscription: StripeSubscription,
  ): Promise<void> {
    const freshSubscription = await this.stripe.subscriptions.retrieve(
      subscription.id,
      { expand: ['items.data.price'] },
    );

    await this.syncSubscriptionFromStripe(freshSubscription, {
      applyPlanTierOnActive: true,
    });
  }

  private async handleSubscriptionDeleted(
    subscription: StripeSubscription,
  ): Promise<void> {
    const subscriptionExpiresAt = stripePeriodEndToIso(
      extractSubscriptionPeriodEnd(subscription),
    );

    const updated = await this.syncSubscriptionFromStripe(subscription, {
      subscriptionStatus: 'CANCELED',
      planTier: 'SOLO',
      subscriptionExpiresAt,
      applyPlanTierOnActive: false,
    });

    if (!updated) {
      this.logger.warn(
        `customer.subscription.deleted: no tenant for subscription ${subscription.id}`,
      );
    } else {
      this.logger.log(
        `Subscription canceled: tenant=${updated.id} plan_tier=SOLO`,
      );
    }
  }

  private async syncSubscriptionFromStripe(
    subscription: StripeSubscription,
    options: {
      subscriptionStatus?: SubscriptionStatus;
      planTier?: PlanTier;
      subscriptionExpiresAt?: string | null;
      applyPlanTierOnActive: boolean;
    },
  ): Promise<Tenant | null> {
    const stripeStatus = subscription.status;
    const subscriptionStatus =
      options.subscriptionStatus ?? mapStripeSubscriptionStatus(stripeStatus);
    const stripeSubscriptionId = subscription.id;
    const stripeCustomerId = extractStripeId(subscription.customer);
    const subscriptionExpiresAt =
      options.subscriptionExpiresAt ??
      stripePeriodEndToIso(extractSubscriptionPeriodEnd(subscription));

    const existingTenant = await this.resolveTenantForSubscriptionSync(
      stripeSubscriptionId,
      stripeCustomerId,
    );

    let planTier = options.planTier;

    if (
      options.applyPlanTierOnActive &&
      (stripeStatus === 'active' || stripeStatus === 'trialing')
    ) {
      const priceId = extractSubscriptionPriceId(subscription, {
        excludePriceIds: this.getSupportAiPriceIdsToExclude(),
      });
      planTier = this.resolvePlanTierFromStripePrice(priceId, {
        existingPlanTier: existingTenant?.plan_tier,
      });
    }
    const trialTransition = resolveSubscriptionTrialTransition(
      existingTenant,
      subscriptionStatus,
    );

    const payload = {
      stripeSubscriptionId,
      subscriptionStatus,
      subscriptionExpiresAt,
      ...(planTier !== undefined ? { planTier } : {}),
      ...trialTransition,
    };

    let tenant =
      await this.tenantsService.updateSubscriptionByStripeSubscriptionId(
        stripeSubscriptionId,
        payload,
      );

    if (!tenant && stripeCustomerId) {
      tenant = await this.tenantsService.updateSubscriptionByStripeCustomerId(
        stripeCustomerId,
        payload,
      );
    }

    if (!tenant) {
      this.logger.warn(
        `No tenant found for subscription ${stripeSubscriptionId} (status=${subscriptionStatus})`,
      );
      return null;
    }

    tenant = await this.syncSupportAiEntitlementFromSubscription(
      tenant,
      subscription,
      subscriptionStatus,
    );

    this.logger.log(
      `Subscription synced: tenant=${tenant.id} status=${subscriptionStatus}${
        planTier ? ` plan_tier=${planTier}` : ''
      }`,
    );

    return tenant;
  }

  private async resolveTenantForSubscriptionSync(
    stripeSubscriptionId: string,
    stripeCustomerId: string | null,
  ): Promise<Tenant | null> {
    let tenant =
      await this.tenantsService.findByStripeSubscriptionId(
        stripeSubscriptionId,
      );

    if (!tenant && stripeCustomerId) {
      tenant =
        await this.tenantsService.findByStripeCustomerId(stripeCustomerId);
    }

    return tenant;
  }

  async syncTenantSubscription(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenantsService.findById(tenantId);

    if (!tenant) {
      throw new NotFoundException(
        `Tenant with id "${tenantId}" was not found`,
      );
    }

    let subscription: StripeSubscription | null = null;

    if (tenant.stripe_subscription_id) {
      try {
        subscription = await this.stripe.subscriptions.retrieve(
          tenant.stripe_subscription_id,
          { expand: ['items.data.price'] },
        );
      } catch (error) {
        this.logger.warn(
          `Failed to retrieve subscription ${tenant.stripe_subscription_id}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    if (!subscription && tenant.stripe_customer_id) {
      subscription = await this.findLatestBillableSubscription(
        tenant.stripe_customer_id,
      );
    }

    if (!subscription) {
      throw new BadRequestException(
        'Ainda não encontramos uma assinatura ativa no Stripe. Se você acabou de pagar, aguarde alguns segundos e tente novamente. Em desenvolvimento local, use o Stripe CLI para encaminhar webhooks.',
      );
    }

    const updated = await this.syncSubscriptionFromStripe(subscription, {
      applyPlanTierOnActive: true,
    });

    if (!updated) {
      throw new InternalServerErrorException(
        'Não foi possível sincronizar a assinatura com o estabelecimento.',
      );
    }

    return updated;
  }

  private async findLatestBillableSubscription(
    stripeCustomerId: string,
  ): Promise<StripeSubscription | null> {
    for (const status of ['active', 'trialing', 'past_due'] as const) {
      const listed = await this.stripe.subscriptions.list({
        customer: stripeCustomerId,
        status,
        limit: 1,
        expand: ['data.items.data.price'],
      });

      if (listed.data[0]) {
        return listed.data[0];
      }
    }

    return null;
  }

  async createCustomerPortalSession(
    tenantId: string,
  ): Promise<CheckoutSessionResponse> {
    const tenant = await this.tenantsService.findById(tenantId);

    if (!tenant) {
      throw new NotFoundException(
        `Tenant with id "${tenantId}" was not found`,
      );
    }

    const stripeCustomerId = tenant.stripe_customer_id?.trim();

    if (!stripeCustomerId) {
      throw new BadRequestException(
        'Nenhuma assinatura vinculada ao Stripe. Assine um plano antes de gerenciar a cobrança.',
      );
    }

    const returnUrl = this.getRequiredUrl('STRIPE_BILLING_PORTAL_RETURN_URL');

    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: returnUrl,
      });

      if (!session.url) {
        throw new InternalServerErrorException(
          'Stripe did not return a customer portal session URL',
        );
      }

      return { url: session.url };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Não foi possível abrir o portal de assinatura no Stripe.',
      );
    }
  }

  async createCheckoutSession(
    params: CreateCheckoutSessionParams,
  ): Promise<CheckoutSessionResponse> {
    const tenant = await this.tenantsService.findById(params.tenantId);

    if (!tenant) {
      throw new NotFoundException(
        `Tenant with id "${params.tenantId}" was not found`,
      );
    }

    if (tenantHasManageableSubscription(tenant)) {
      throw new BadRequestException(
        'Você já possui uma assinatura ativa. Use "Gerenciar assinatura" para trocar de plano ou cancelar.',
      );
    }

    const planTier = normalizePlanTier(params.planTier);
    const priceId = this.resolveStripePriceId(planTier);

    const ownerEmail = params.ownerEmail.trim();

    if (!ownerEmail) {
      throw new BadRequestException(
        'Authenticated user must have an email to start checkout',
      );
    }

    let stripeCustomerId = tenant.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await this.stripe.customers.create({
        email: ownerEmail,
        name: params.tenantName,
        metadata: {
          tenant_id: tenant.id,
        },
      });

      await this.tenantsService.updateStripeCustomerId(
        tenant.id,
        customer.id,
      );
      stripeCustomerId = customer.id;
    }

    const successUrl = this.getRequiredUrl('STRIPE_BILLING_SUCCESS_URL');
    const cancelUrl = this.getRequiredUrl('STRIPE_BILLING_CANCEL_URL');

    try {
      const session = await this.stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: 'subscription',
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        allow_promotion_codes: true,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          tenant_id: tenant.id,
          plan_tier: planTier,
        },
        subscription_data: {
          metadata: {
            tenant_id: tenant.id,
            plan_tier: planTier,
          },
        },
      });

      if (!session.url) {
        throw new InternalServerErrorException(
          'Stripe did not return a checkout session URL',
        );
      }

      return { url: session.url };
    } catch (error) {
      this.rethrowStripeCheckoutError(error, priceId);
    }
  }

  /**
   * Adiciona o price do Assistente IA como item na subscription existente.
   * Exige plano ACTIVE (não disponível no trial do produto).
   */
  async addSupportAiAddon(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenantsService.findById(tenantId);

    if (!tenant) {
      throw new NotFoundException(
        `Tenant with id "${tenantId}" was not found`,
      );
    }

    if (tenant.subscription_status !== 'ACTIVE') {
      throw new BadRequestException(
        'Assine um plano ativo antes de contratar o Assistente IA. O período de testes não inclui o complemento.',
      );
    }

    if (!tenant.stripe_subscription_id?.trim()) {
      throw new BadRequestException(
        'Não encontramos uma assinatura Stripe para este estabelecimento.',
      );
    }

    const supportAiPriceId = this.resolveSupportAiPriceId();

    if (
      tenant.support_ai_enabled &&
      tenant.support_ai_status === 'active' &&
      tenant.support_ai_stripe_subscription_item_id
    ) {
      throw new BadRequestException(
        'O Assistente IA já está ativo neste estabelecimento.',
      );
    }

    const subscription = await this.stripe.subscriptions.retrieve(
      tenant.stripe_subscription_id,
      { expand: ['items.data.price'] },
    );

    const existingItem = findSubscriptionItemByPriceId(
      subscription,
      supportAiPriceId,
    );

    if (existingItem) {
      return this.tenantsService.updateSupportAiEntitlement(tenant.id, {
        supportAiEnabled: true,
        supportAiStripeSubscriptionItemId: existingItem.itemId,
        supportAiStatus: this.mapSupportAiStatusFromSubscription(
          mapStripeSubscriptionStatus(subscription.status),
        ),
      });
    }

    try {
      const createdItem = await this.stripe.subscriptionItems.create({
        subscription: tenant.stripe_subscription_id,
        price: supportAiPriceId,
        quantity: 1,
        proration_behavior: 'create_prorations',
      });

      const freshSubscription = await this.stripe.subscriptions.retrieve(
        tenant.stripe_subscription_id,
        { expand: ['items.data.price'] },
      );

      const synced = await this.syncSubscriptionFromStripe(freshSubscription, {
        applyPlanTierOnActive: true,
      });

      if (synced) {
        return synced;
      }

      return this.tenantsService.updateSupportAiEntitlement(tenant.id, {
        supportAiEnabled: true,
        supportAiStripeSubscriptionItemId: createdItem.id,
        supportAiStatus: 'active',
      });
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      this.logger.warn(
        `Failed to add Support AI addon for tenant ${tenant.id}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );

      throw new InternalServerErrorException(
        'Não foi possível adicionar o Assistente IA à assinatura. Tente novamente ou use o portal Stripe.',
      );
    }
  }

  private async syncSupportAiEntitlementFromSubscription(
    tenant: Tenant,
    subscription: StripeSubscription,
    subscriptionStatus: SubscriptionStatus,
  ): Promise<Tenant> {
    const supportAiPriceId = this.getOptionalSupportAiPriceId();

    if (!supportAiPriceId) {
      return tenant;
    }

    const aiItem = findSubscriptionItemByPriceId(subscription, supportAiPriceId);

    if (aiItem) {
      const supportAiStatus = this.mapSupportAiStatusFromSubscription(
        subscriptionStatus,
      );

      return this.tenantsService.updateSupportAiEntitlement(tenant.id, {
        supportAiEnabled: true,
        supportAiStripeSubscriptionItemId: aiItem.itemId,
        supportAiStatus,
      });
    }

    // Item removido: só limpa se o entitlement vinha do Stripe (havia item id).
    if (tenant.support_ai_stripe_subscription_item_id) {
      return this.tenantsService.updateSupportAiEntitlement(tenant.id, {
        supportAiEnabled: false,
        supportAiStripeSubscriptionItemId: null,
        supportAiStatus: 'canceled',
      });
    }

    return tenant;
  }

  private mapSupportAiStatusFromSubscription(
    subscriptionStatus: SubscriptionStatus,
  ): SupportAiStatus {
    switch (subscriptionStatus) {
      case 'ACTIVE':
        return 'active';
      case 'PAST_DUE':
        return 'past_due';
      case 'CANCELED':
        return 'canceled';
      case 'INACTIVE':
      default:
        return 'inactive';
    }
  }

  private getSupportAiPriceIdsToExclude(): string[] {
    const priceId = this.getOptionalSupportAiPriceId();
    return priceId ? [priceId] : [];
  }

  private getOptionalSupportAiPriceId(): string | null {
    const raw = this.configService
      .get<string>('STRIPE_SUPPORT_AI_PRICE_ID')
      ?.trim();

    if (!raw || !raw.startsWith('price_')) {
      return null;
    }

    return raw;
  }

  private resolveSupportAiPriceId(): string {
    const raw = this.configService
      .get<string>('STRIPE_SUPPORT_AI_PRICE_ID')
      ?.trim();

    if (!raw) {
      throw new InternalServerErrorException(
        'STRIPE_SUPPORT_AI_PRICE_ID is not configured',
      );
    }

    return this.assertStripePriceId(raw, 'STRIPE_SUPPORT_AI_PRICE_ID');
  }

  private resolveStripePriceId(planTier: PlanTier): string {
    const envKeyByTier: Record<PlanTier, string> = {
      SOLO: 'STRIPE_SOLO_PRICE_ID',
      PRO: 'STRIPE_PRO_TIER_PRICE_ID',
      ELITE: 'STRIPE_ELITE_PRICE_ID',
    };

    const fallbackByTier: Partial<Record<PlanTier, string>> = {
      SOLO: 'STRIPE_PRO_PRICE_ID',
    };

    const envKey = envKeyByTier[planTier];
    const raw =
      this.configService.get<string>(envKey)?.trim() ??
      (fallbackByTier[planTier]
        ? this.configService.get<string>(fallbackByTier[planTier]!)?.trim()
        : undefined);

    if (!raw) {
      throw new InternalServerErrorException(
        `${envKey} is not configured${fallbackByTier[planTier] ? ` (fallback ${fallbackByTier[planTier]} also missing)` : ''}`,
      );
    }

    return this.assertStripePriceId(raw, envKey);
  }

  private assertStripePriceId(raw: string, envKey: string): string {
    if (raw.startsWith('prod_')) {
      throw new BadRequestException(
        `${envKey} está com um Product ID (prod_...). Copie o Price ID (price_...) no Stripe Dashboard.`,
      );
    }

    if (!raw.startsWith('price_')) {
      throw new BadRequestException(
        `${envKey} deve ser um Price ID do Stripe (começa com price_...).`,
      );
    }

    return raw;
  }

  private rethrowStripeCheckoutError(error: unknown, priceId: string): never {
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      if (
        error.code === 'resource_missing' &&
        error.param === 'line_items[0][price]'
      ) {
        throw new BadRequestException(
          priceId.startsWith('prod_')
            ? 'STRIPE_PRO_PRICE_ID está com um Product ID (prod_...). Use o Price ID (price_...) do painel Stripe.'
            : `Price ID inválido ou inexistente no Stripe: ${priceId}. Confira se a chave sk_test/sk_live é da mesma conta onde o preço foi criado.`,
        );
      }
    }

    if (error instanceof InternalServerErrorException) {
      throw error;
    }

    if (error instanceof BadRequestException) {
      throw error;
    }

    throw new InternalServerErrorException(
      'Não foi possível criar a sessão de checkout no Stripe.',
    );
  }

  private getRequiredUrl(envKey: string): string {
    const value = this.configService.get<string>(envKey)?.trim();

    if (!value) {
      throw new InternalServerErrorException(`${envKey} is not configured`);
    }

    return value;
  }

  buildStripeConnectStatus(tenant: Tenant): StripeConnectStatusResponse {
    const accountId = tenant.stripe_connect_account_id?.trim() || null;
    const chargesEnabled = Boolean(tenant.stripe_connect_charges_enabled);
    const detailsSubmitted = Boolean(tenant.stripe_connect_details_submitted);
    const isReady = Boolean(accountId && chargesEnabled);
    const applicationFeePercent =
      this.resolveConnectApplicationFeePercentForTenant(tenant);

    return {
      accountId,
      chargesEnabled,
      detailsSubmitted,
      isReady,
      onboardingRequired: !accountId || !chargesEnabled,
      applicationFeePercent,
      canOpenDashboard: isReady,
    };
  }

  async getConnectStatus(tenantId: string): Promise<StripeConnectStatusResponse> {
    const tenant = await this.tenantsService.findById(tenantId);

    if (!tenant) {
      throw new NotFoundException(
        `Tenant with id "${tenantId}" was not found`,
      );
    }

    const accountId = tenant.stripe_connect_account_id?.trim();

    if (!accountId) {
      return this.buildStripeConnectStatus(tenant);
    }

    const syncedTenant = await this.syncConnectAccountFromStripe(tenantId);

    return this.buildStripeConnectStatus(syncedTenant ?? tenant);
  }

  async createConnectOnboardingLink(
    tenantId: string,
    ownerEmail: string,
  ): Promise<CheckoutSessionResponse> {
    const tenant = await this.tenantsService.findById(tenantId);

    if (!tenant) {
      throw new NotFoundException(
        `Tenant with id "${tenantId}" was not found`,
      );
    }

    const normalizedEmail = ownerEmail.trim().toLowerCase();

    if (!normalizedEmail) {
      throw new BadRequestException(
        'Sua conta precisa ter um e-mail para conectar o Stripe.',
      );
    }

    let connectAccountId = tenant.stripe_connect_account_id?.trim() || null;

    if (!connectAccountId) {
      const account = await this.stripe.accounts.create({
        type: 'express',
        country: 'BR',
        email: normalizedEmail,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
        metadata: {
          tenant_id: tenantId,
        },
      });

      connectAccountId = account.id;

      await this.tenantsService.updateStripeConnectStatus(tenantId, {
        stripeConnectAccountId: connectAccountId,
        stripeConnectChargesEnabled: false,
        stripeConnectDetailsSubmitted: false,
      });
    }

    const returnUrl = this.getRequiredUrl(
      'STRIPE_CONNECT_ONBOARDING_RETURN_URL',
    );
    const refreshUrl = this.getRequiredUrl(
      'STRIPE_CONNECT_ONBOARDING_REFRESH_URL',
    );

    const accountLink = await this.stripe.accountLinks.create({
      account: connectAccountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });

    if (!accountLink.url) {
      throw new InternalServerErrorException(
        'Stripe did not return an onboarding URL',
      );
    }

    return { url: accountLink.url };
  }

  async createConnectDashboardLink(
    tenantId: string,
  ): Promise<CheckoutSessionResponse> {
    const tenant = await this.tenantsService.findById(tenantId);

    if (!tenant) {
      throw new NotFoundException(
        `Tenant with id "${tenantId}" was not found`,
      );
    }

    const connectAccountId = tenant.stripe_connect_account_id?.trim();

    if (!connectAccountId || !tenant.stripe_connect_charges_enabled) {
      throw new BadRequestException(
        'Conecte e ative sua conta Stripe antes de abrir o painel de recebimentos.',
      );
    }

    try {
      const loginLink =
        await this.stripe.accounts.createLoginLink(connectAccountId);

      if (!loginLink.url) {
        throw new InternalServerErrorException(
          'Stripe did not return a dashboard login URL',
        );
      }

      return { url: loginLink.url };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Não foi possível abrir o painel Stripe do estabelecimento.',
      );
    }
  }

  async syncConnectAccountFromStripe(tenantId: string): Promise<Tenant | null> {
    const tenant = await this.tenantsService.findById(tenantId);

    if (!tenant) {
      throw new NotFoundException(
        `Tenant with id "${tenantId}" was not found`,
      );
    }

    const connectAccountId = tenant.stripe_connect_account_id?.trim();

    if (!connectAccountId) {
      return tenant;
    }

    const account = await this.stripe.accounts.retrieve(connectAccountId);

    return this.tenantsService.updateStripeConnectStatus(tenantId, {
      stripeConnectChargesEnabled: Boolean(account.charges_enabled),
      stripeConnectDetailsSubmitted: Boolean(account.details_submitted),
    });
  }

  private async handleConnectAccountUpdated(
    account: StripeAccount,
  ): Promise<void> {
    const connectAccountId = account.id?.trim();

    if (!connectAccountId) {
      return;
    }

    const tenant =
      await this.tenantsService.findByStripeConnectAccountId(connectAccountId);

    if (!tenant) {
      this.logger.debug(
        `Stripe Connect account.updated without tenant match: ${connectAccountId}`,
      );
      return;
    }

    await this.tenantsService.updateStripeConnectStatus(tenant.id, {
      stripeConnectChargesEnabled: Boolean(account.charges_enabled),
      stripeConnectDetailsSubmitted: Boolean(account.details_submitted),
    });

    this.logger.log(
      `Stripe Connect synced: tenant=${tenant.id} charges_enabled=${Boolean(account.charges_enabled)}`,
    );
  }

  private getDefaultConnectApplicationFeePercent(): number {
    const rawPercent = this.configService.get<string>(
      'STRIPE_CONNECT_APPLICATION_FEE_PERCENT',
    );
    const percent = rawPercent ? Number.parseFloat(rawPercent) : 0;

    if (!Number.isFinite(percent) || percent <= 0) {
      return 0;
    }

    if (percent > 100) {
      throw new InternalServerErrorException(
        'STRIPE_CONNECT_APPLICATION_FEE_PERCENT must be between 0 and 100',
      );
    }

    return percent;
  }

  private resolveConnectApplicationFeePercentForTenant(tenant: Tenant): number {
    return resolveTenantDepositApplicationFeePercent(
      tenant.deposit_application_fee_percent,
      this.getDefaultConnectApplicationFeePercent(),
    );
  }
}
