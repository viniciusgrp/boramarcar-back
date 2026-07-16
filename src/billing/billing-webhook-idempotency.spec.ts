import { InternalServerErrorException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { AppointmentsService } from '../appointments/appointments.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { TenantsService } from '../tenants/tenants.service';
import { BillingService } from './billing.service';
import type { StripeEvent } from './types/stripe-api.types';

interface InsertResult {
  error: { code?: string; message: string } | null;
}

function buildEvent(id: string, type: string): StripeEvent {
  return {
    id,
    type,
    data: { object: {} },
  } as unknown as StripeEvent;
}

function buildService(insertResult: InsertResult) {
  const insertMock = jest.fn().mockResolvedValue(insertResult);
  const deleteEqMock = jest.fn().mockResolvedValue({ error: null });
  const deleteMock = jest.fn(() => ({ eq: deleteEqMock }));

  const fromMock = jest.fn(() => ({
    insert: insertMock,
    delete: deleteMock,
  }));

  const supabaseService = {
    getClient: () => ({ from: fromMock }),
  } as unknown as SupabaseService;

  const configService = {
    get: (key: string) =>
      key === 'STRIPE_SECRET_KEY' ? 'sk_test_dummy' : undefined,
  } as unknown as ConfigService;

  const service = new BillingService(
    configService,
    {} as TenantsService,
    supabaseService,
    {} as AppointmentsService,
  );

  return { service, insertMock, deleteEqMock };
}

describe('BillingService webhook idempotency', () => {
  it('claims a new event and processes it once', async () => {
    const { service, insertMock } = buildService({ error: null });
    const processSpy = jest
      .spyOn(
        service as unknown as { processWebhookEvent: () => Promise<void> },
        'processWebhookEvent',
      )
      .mockResolvedValue(undefined);

    await service.handleStripeWebhook(buildEvent('evt_1', 'invoice.paid'));

    expect(insertMock).toHaveBeenCalledWith({
      event_id: 'evt_1',
      event_type: 'invoice.paid',
    });
    expect(processSpy).toHaveBeenCalledTimes(1);
  });

  it('skips processing when the event was already claimed (unique violation)', async () => {
    const { service } = buildService({
      error: { code: '23505', message: 'duplicate key' },
    });
    const processSpy = jest
      .spyOn(
        service as unknown as { processWebhookEvent: () => Promise<void> },
        'processWebhookEvent',
      )
      .mockResolvedValue(undefined);

    await service.handleStripeWebhook(buildEvent('evt_1', 'invoice.paid'));

    expect(processSpy).not.toHaveBeenCalled();
  });

  it('releases the claim when processing throws so retries can reprocess', async () => {
    const { service, deleteEqMock } = buildService({ error: null });
    jest
      .spyOn(
        service as unknown as { processWebhookEvent: () => Promise<void> },
        'processWebhookEvent',
      )
      .mockRejectedValue(new Error('processing failed'));

    await expect(
      service.handleStripeWebhook(buildEvent('evt_1', 'invoice.paid')),
    ).rejects.toThrow('processing failed');

    expect(deleteEqMock).toHaveBeenCalledWith('event_id', 'evt_1');
  });

  it('throws when the claim insert fails for a non-duplicate error', async () => {
    const { service } = buildService({
      error: { code: '500', message: 'db unavailable' },
    });

    await expect(
      service.handleStripeWebhook(buildEvent('evt_1', 'invoice.paid')),
    ).rejects.toThrow(InternalServerErrorException);
  });
});
