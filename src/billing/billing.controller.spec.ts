import { BillingController } from './billing.controller';
import { PaymentsWebhookController } from './payments-webhook.controller';

describe('billing webhook controllers', () => {
  it('forwards Asaas webhooks to BillingService', async () => {
    const billingService = {
      handleAsaasWebhook: jest.fn().mockResolvedValue({ received: true }),
    };
    const controller = new BillingController(billingService as never, {} as never);
    const body = { id: 'evt_1', event: 'PAYMENT_RECEIVED' };

    await expect(
      controller.handleAsaasWebhook('token', body as never),
    ).resolves.toEqual({ received: true });
    expect(billingService.handleAsaasWebhook).toHaveBeenCalledWith('token', body);
  });

  it('exposes the public payments webhook alias', async () => {
    const billingService = {
      handleAsaasWebhook: jest.fn().mockResolvedValue({ received: true }),
    };
    const controller = new PaymentsWebhookController(billingService as never);

    await expect(
      controller.handleAsaasWebhook('token', { id: 'evt_1' } as never),
    ).resolves.toEqual({ received: true });
  });
});
