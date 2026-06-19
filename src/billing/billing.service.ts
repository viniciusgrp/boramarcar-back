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
import { TenantsService } from '../tenants/tenants.service';
import { CheckoutSessionResponse } from './entities/checkout-session-response.entity';
import { WebhookAckResponse } from './entities/webhook-ack-response.entity';
import type {
  StripeCheckoutSession,
  StripeEvent,
  StripeSubscription,
} from './types/stripe-api.types';
import { extractSubscriptionPriceId } from './utils/extract-subscription-price-id.util';
import { mapStripeSubscriptionStatus } from './utils/map-stripe-subscription-status';
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
  depositAmountBrl: number;
}

type StripeClient = InstanceType<typeof Stripe>;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: StripeClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly tenantsService: TenantsService,
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
    }

    return { received: true };
  }

  async handleStripeWebhook(event: StripeEvent): Promise<void> {
    await this.processWebhookEvent(event);
  }

  private async processWebhookEvent(event: StripeEvent): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(event.data.object);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
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

    const appointment =
      await this.appointmentsService.confirmDepositPayment(appointmentId);

    if (!appointment) {
      this.logger.warn(
        `Deposit payment received but appointment ${appointmentId} was not found`,
      );
      return;
    }

    this.logger.log(
      `Deposit confirmed: appointment=${appointmentId} status=CONFIRMED payment_status=PAID`,
    );
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

    const successBaseUrl = this.getRequiredUrl('STRIPE_DEPOSIT_SUCCESS_URL');
    const cancelUrl = this.getRequiredUrl('STRIPE_DEPOSIT_CANCEL_URL');
    const successUrl = `${successBaseUrl}${successBaseUrl.includes('?') ? '&' : '?'}appointment_id=${params.appointmentId}`;

    const unitAmountCents = Math.round(params.depositAmountBrl * 100);

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
    const priceId = extractSubscriptionPriceId(stripeSubscription);
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
      const priceId = extractSubscriptionPriceId(subscription);
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
}
