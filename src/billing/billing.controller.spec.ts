import { BillingController } from './billing.controller';
import { PaymentsWebhookController } from './payments-webhook.controller';

describe('billing webhook controllers', () => {
  it('forwards Stripe webhooks to BillingService', async () => {
    const billingService = {
      handleWebhook: jest.fn().mockResolvedValue({ received: true }),
    };
    const controller = new BillingController(billingService as never, {} as never);
    const raw = Buffer.from('payload');

    await expect(
      controller.handleWebhook('sig_test', { rawBody: raw } as never),
    ).resolves.toEqual({ received: true });
    expect(billingService.handleWebhook).toHaveBeenCalledWith('sig_test', raw);
  });

  it('exposes the public payments webhook alias', async () => {
    const billingService = {
      handleWebhook: jest.fn().mockResolvedValue({ received: true }),
    };
    const controller = new PaymentsWebhookController(billingService as never);

    await expect(
      controller.handleWebhook('sig_test', { rawBody: Buffer.from('x') } as never),
    ).resolves.toEqual({ received: true });
  });
});
