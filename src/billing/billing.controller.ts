import {
  BadRequestException,
  Controller,
  Headers,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantsService } from '../tenants/tenants.service';
import { BillingService } from './billing.service';
import { CheckoutSessionResponse } from './entities/checkout-session-response.entity';
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

  @Post('checkout')
  @UseGuards(AuthGuard)
  async createCheckout(
    @CurrentUser() user: User,
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
    });
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
