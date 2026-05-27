import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { TenantsService } from '../tenants/tenants.service';
import { CheckoutSessionResponse } from './entities/checkout-session-response.entity';
import { WebhookAckResponse } from './entities/webhook-ack-response.entity';
import type {
  StripeCheckoutSession,
  StripeEvent,
  StripeSubscription,
} from './types/stripe-api.types';
import { mapStripeSubscriptionStatus } from './utils/map-stripe-subscription-status';
import {
  extractSubscriptionPeriodEnd,
  stripePeriodEndToIso,
} from './utils/stripe-period-end.util';
import { extractStripeId } from './utils/stripe-id.util';

export interface CreateCheckoutSessionParams {
  tenantId: string;
  tenantName: string;
  ownerEmail: string;
}

type StripeClient = InstanceType<typeof Stripe>;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: StripeClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly tenantsService: TenantsService,
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

    await this.processWebhookEvent(event);

    return { received: true };
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

  private async handleCheckoutSessionCompleted(
    session: StripeCheckoutSession,
  ): Promise<void> {
    if (session.mode !== 'subscription') {
      return;
    }

    const stripeCustomerId = extractStripeId(session.customer);
    const stripeSubscriptionId = extractStripeId(session.subscription);

    if (!stripeCustomerId || !stripeSubscriptionId) {
      this.logger.warn(
        'checkout.session.completed missing customer or subscription id',
      );
      return;
    }

    const stripeSubscription = await this.stripe.subscriptions.retrieve(
      stripeSubscriptionId,
      { expand: ['items.data'] },
    );
    const subscriptionExpiresAt = stripePeriodEndToIso(
      extractSubscriptionPeriodEnd(stripeSubscription),
    );

    let tenant =
      await this.tenantsService.updateSubscriptionByStripeCustomerId(
        stripeCustomerId,
        {
          stripeSubscriptionId,
          subscriptionStatus: 'ACTIVE',
          subscriptionExpiresAt,
        },
      );

    if (!tenant && session.metadata?.tenant_id) {
      const existingTenant = await this.tenantsService.findById(
        session.metadata.tenant_id,
      );

      if (existingTenant) {
        await this.tenantsService.updateStripeCustomerId(
          existingTenant.id,
          stripeCustomerId,
        );
        tenant =
          await this.tenantsService.updateSubscriptionByStripeCustomerId(
            stripeCustomerId,
            {
              stripeSubscriptionId,
              subscriptionStatus: 'ACTIVE',
              subscriptionExpiresAt,
            },
          );
      }
    }

    if (!tenant) {
      this.logger.warn(
        `No tenant found for Stripe customer ${stripeCustomerId} after checkout`,
      );
    }
  }

  private async handleSubscriptionUpdated(
    subscription: StripeSubscription,
  ): Promise<void> {
    await this.syncSubscriptionStatus(subscription);
  }

  private async handleSubscriptionDeleted(
    subscription: StripeSubscription,
  ): Promise<void> {
    await this.syncSubscriptionStatus(subscription);
  }

  private async syncSubscriptionStatus(
    subscription: StripeSubscription,
  ): Promise<void> {
    const subscriptionStatus = mapStripeSubscriptionStatus(subscription.status);
    const stripeSubscriptionId = subscription.id;
    const stripeCustomerId = extractStripeId(subscription.customer);
    const subscriptionExpiresAt = stripePeriodEndToIso(
      extractSubscriptionPeriodEnd(subscription),
    );

    let tenant =
      await this.tenantsService.updateSubscriptionByStripeSubscriptionId(
        stripeSubscriptionId,
        {
          subscriptionStatus,
          subscriptionExpiresAt,
        },
      );

    if (!tenant && stripeCustomerId) {
      tenant = await this.tenantsService.updateSubscriptionByStripeCustomerId(
        stripeCustomerId,
        {
          stripeSubscriptionId,
          subscriptionStatus,
          subscriptionExpiresAt,
        },
      );
    }

    if (!tenant) {
      this.logger.warn(
        `No tenant found for subscription ${stripeSubscriptionId}`,
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

    const priceId = this.resolveStripePriceId();

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
        },
        subscription_data: {
          metadata: {
            tenant_id: tenant.id,
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

  private resolveStripePriceId(): string {
    const raw = this.configService.get<string>('STRIPE_PRO_PRICE_ID')?.trim();

    if (!raw) {
      throw new InternalServerErrorException(
        'STRIPE_PRO_PRICE_ID is not configured',
      );
    }

    if (raw.startsWith('prod_')) {
      throw new BadRequestException(
        'STRIPE_PRO_PRICE_ID está com um Product ID (prod_...). No Stripe Dashboard, abra o produto BoraMarcar Pro e copie o Price ID (começa com price_...).',
      );
    }

    if (!raw.startsWith('price_')) {
      throw new BadRequestException(
        'STRIPE_PRO_PRICE_ID deve ser um Price ID do Stripe (começa com price_...).',
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
