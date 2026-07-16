import type { ConfigService } from '@nestjs/config';
import type { AppointmentsService } from '../appointments/appointments.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { TenantsService } from '../tenants/tenants.service';
import { BillingService } from './billing.service';
import type { StripeCheckoutSession, StripeEvent } from './types/stripe-api.types';

function buildBillingService(appointments: Partial<AppointmentsService>) {
  const configService = {
    get: (key: string) =>
      key === 'STRIPE_SECRET_KEY' ? 'sk_test_dummy' : undefined,
  } as unknown as ConfigService;

  const supabaseService = {
    getClient: () => ({
      from: () => ({
        insert: jest.fn().mockResolvedValue({ error: null }),
        delete: jest.fn(() => ({
          eq: jest.fn().mockResolvedValue({ error: null }),
        })),
      }),
    }),
  } as unknown as SupabaseService;

  return new BillingService(
    configService,
    {} as TenantsService,
    supabaseService,
    appointments as AppointmentsService,
  );
}

function buildCheckoutEvent(
  type: 'checkout.session.completed' | 'checkout.session.expired',
  session: Partial<StripeCheckoutSession>,
): StripeEvent {
  return {
    id: `evt_${type}`,
    type,
    data: {
      object: {
        object: 'checkout.session',
        mode: 'payment',
        metadata: {
          checkout_type: 'appointment_deposit',
          appointment_id: 'appt-1',
        },
        ...session,
      },
    },
  } as unknown as StripeEvent;
}

describe('BillingService deposit lifecycle', () => {
  it('confirms deposit on checkout.session.completed when hold is pending', async () => {
    const confirmDepositPaymentDetailed = jest.fn().mockResolvedValue({
      outcome: 'confirmed',
      appointment: { id: 'appt-1', status: 'CONFIRMED' },
    });
    const service = buildBillingService({ confirmDepositPaymentDetailed });

    await service.handleStripeWebhook(
      buildCheckoutEvent('checkout.session.completed', {}),
    );

    expect(confirmDepositPaymentDetailed).toHaveBeenCalledWith('appt-1');
  });

  it('auto-refunds when payment arrives after hold was cancelled', async () => {
    const confirmDepositPaymentDetailed = jest.fn().mockResolvedValue({
      outcome: 'late_payment_needs_refund',
      appointment: { id: 'appt-1', status: 'CANCELLED' },
    });
    const markDepositRefunded = jest.fn().mockResolvedValue({
      id: 'appt-1',
      payment_status: 'REFUNDED',
    });
    const service = buildBillingService({
      confirmDepositPaymentDetailed,
      markDepositRefunded,
    });

    const refundsCreate = jest.fn().mockResolvedValue({ id: 're_1' });
    (
      service as unknown as {
        stripe: { refunds: { create: typeof refundsCreate } };
      }
    ).stripe = { refunds: { create: refundsCreate } };

    await service.handleStripeWebhook(
      buildCheckoutEvent('checkout.session.completed', {
        payment_intent: 'pi_late',
      }),
    );

    expect(refundsCreate).toHaveBeenCalledWith({ payment_intent: 'pi_late' });
    expect(markDepositRefunded).toHaveBeenCalledWith('appt-1');
  });

  it('releases pending hold on checkout.session.expired', async () => {
    const releasePendingDepositHold = jest.fn().mockResolvedValue(true);
    const service = buildBillingService({ releasePendingDepositHold });

    await service.handleStripeWebhook(
      buildCheckoutEvent('checkout.session.expired', {}),
    );

    expect(releasePendingDepositHold).toHaveBeenCalledWith('appt-1');
  });
});
