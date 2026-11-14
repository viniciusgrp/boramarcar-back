import { Body, Controller, Headers, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { AsaasWebhookEvent } from '../asaas/asaas.types';
import { BillingService } from './billing.service';
import { WebhookAckResponse } from './entities/webhook-ack-response.entity';

/**
 * Alias público cadastrado no painel Asaas
 * (`https://app.horariocerto.app/v1/payments/asaas/webhook`).
 */
@Controller('v1/payments')
export class PaymentsWebhookController {
  constructor(private readonly billingService: BillingService) {}

  @Post('asaas/webhook')
  @SkipThrottle()
  handleAsaasWebhook(
    @Headers('asaas-access-token') accessToken: string | undefined,
    @Body() body: AsaasWebhookEvent,
  ): Promise<WebhookAckResponse> {
    return this.billingService.handleAsaasWebhook(accessToken, body);
  }
}
