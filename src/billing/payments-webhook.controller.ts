import { Controller, Headers, Post, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { BillingService } from './billing.service';
import { WebhookAckResponse } from './entities/webhook-ack-response.entity';

/**
 * Alias público usado no Stripe Dashboard e em docs
 * (`https://api.boramarcar.com.br/v1/payments/webhook`).
 * O handler canônico continua em POST /billing/webhook.
 */
@Controller('v1/payments')
export class PaymentsWebhookController {
  constructor(private readonly billingService: BillingService) {}

  @Post('webhook')
  @SkipThrottle()
  handleWebhook(
    @Headers('stripe-signature') signature: string | undefined,
    @Req() request: RawBodyRequest<Request>,
  ): Promise<WebhookAckResponse> {
    return this.billingService.handleWebhook(signature, request.rawBody);
  }
}
