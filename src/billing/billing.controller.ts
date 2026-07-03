import {
  BadRequestException,
  Controller,
  Headers,
  NotFoundException,
  Body,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SkipTenantAccessCheck } from '../tenants/decorators/skip-tenant-access-check.decorator';
import { TenantsService } from '../tenants/tenants.service';
import { normalizePlanTier } from '../tenants/utils/plan-tier.util';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { BillingService } from './billing.service';
import type { Tenant } from '../tenants/entities/tenant.entity';
import { CheckoutSessionResponse } from './entities/checkout-session-response.entity';
import type { StripeConnectStatusResponse } from './entities/stripe-connect-status.entity';
import { WebhookAckResponse } from './entities/webhook-ack-response.entity';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Post('webhook')
  async handleWebhook(
    @Headers('stripe-signature') signature: string | undefined,
    @Req() request: RawBodyRequest<Request>,
  ): Promise<WebhookAckResponse> {
    return this.billingService.handleWebhook(signature, request.rawBody);
  }

  @Post('sync-subscription')
  @SkipTenantAccessCheck()
  @UseGuards(AuthGuard)
  async syncSubscription(@CurrentUser() user: User): Promise<Tenant> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.billingService.syncTenantSubscription(tenant.id);
  }

  @Post('portal')
  @SkipTenantAccessCheck()
  @UseGuards(AuthGuard)
  async createPortalSession(
    @CurrentUser() user: User,
  ): Promise<CheckoutSessionResponse> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.billingService.createCustomerPortalSession(tenant.id);
  }

  @Post('checkout')
  @SkipTenantAccessCheck()
  @UseGuards(AuthGuard)
  async createCheckout(
    @CurrentUser() user: User,
    @Body() dto: CreateCheckoutDto,
  ): Promise<CheckoutSessionResponse> {
    const tenant = await this.resolveOwnerTenant(user.id);

    if (!user.email?.trim()) {
      throw new BadRequestException(
        'Your account must have an email address to subscribe',
      );
    }

    return this.billingService.createCheckoutSession({
      tenantId: tenant.id,
      tenantName: tenant.name,
      ownerEmail: user.email,
      planTier: normalizePlanTier(dto.planTier),
    });
  }

  @Post('connect/status')
  @SkipTenantAccessCheck()
  @UseGuards(AuthGuard)
  async getConnectStatus(@CurrentUser() user: User) {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.billingService.getConnectStatus(tenant.id);
  }

  @Post('connect/onboard')
  @SkipTenantAccessCheck()
  @UseGuards(AuthGuard)
  async createConnectOnboarding(
    @CurrentUser() user: User,
  ): Promise<CheckoutSessionResponse> {
    const tenant = await this.resolveOwnerTenant(user.id);

    if (!user.email?.trim()) {
      throw new BadRequestException(
        'Your account must have an email address to connect Stripe',
      );
    }

    return this.billingService.createConnectOnboardingLink(
      tenant.id,
      user.email,
    );
  }

  @Post('connect/sync')
  @SkipTenantAccessCheck()
  @UseGuards(AuthGuard)
  async syncConnectStatus(@CurrentUser() user: User) {
    const tenant = await this.resolveOwnerTenant(user.id);
    await this.billingService.syncConnectAccountFromStripe(tenant.id);
    return this.billingService.getConnectStatus(tenant.id);
  }

  private async resolveOwnerTenant(userId: string) {
    const tenant = await this.tenantsService.findByOwnerId(userId);

    if (!tenant) {
      throw new NotFoundException(
        'No establishment linked to the authenticated user',
      );
    }

    return tenant;
  }
}
