import type { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import type { AppointmentsService } from '../appointments/appointments.service';
import type { TenantsService } from '../tenants/tenants.service';
import { BillingService } from './billing.service';
import { createChainableQuery } from '../test-utils/supabase-mock';

function buildService(insertError: { code?: string; message: string } | null) {
  const from = jest.fn(() => createChainableQuery({ data: null, error: insertError }));
  const service = new BillingService(
    {
      get: (key: string) =>
        ({
          APP_ENV: 'production',
          ASAAS_WEBHOOK_TOKEN: 'secret',
        })[key],
    } as unknown as ConfigService,
    {} as TenantsService,
    { getClient: () => ({ from }) } as never,
    {} as AppointmentsService,
    { accruePaidPlanInvoice: jest.fn(), reverseInvoice: jest.fn() } as never,
    {} as never,
  );

  return { service, from };
}

describe('BillingService Asaas webhook idempotency', () => {
  it('rejects an invalid access token', async () => {
    const { service } = buildService(null);

    await expect(
      service.handleAsaasWebhook('wrong', { id: 'evt_1', event: 'PAYMENT_RECEIVED' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('skips events already claimed by event id', async () => {
    const { service } = buildService({ code: '23505', message: 'duplicate' });
    const process = jest.spyOn(service, 'processAsaasWebhookEvent');

    await expect(
      service.handleAsaasWebhook('secret', {
        id: 'evt_1',
        event: 'PAYMENT_RECEIVED',
        payment: { id: 'pay_1' },
      }),
    ).resolves.toEqual({ received: true });

    expect(process).not.toHaveBeenCalled();
  });
});
