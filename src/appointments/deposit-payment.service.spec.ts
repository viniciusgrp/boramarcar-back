import {
  InternalServerErrorException,
} from '@nestjs/common';
import type { SupabaseService } from '../supabase/supabase.service';
import { DepositPaymentService } from './deposit-payment.service';
import type { Appointment } from './entities/appointment.entity';

describe('DepositPaymentService', () => {
  const pendingAppointment = {
    id: 'appt-1',
    status: 'PENDING_PAYMENT',
    payment_status: 'PENDING',
    deposit_paid: false,
  } as Appointment;

  it('confirms only when status is PENDING_PAYMENT', async () => {
    const updateData = {
      ...pendingAppointment,
      status: 'CONFIRMED',
      payment_status: 'PAID',
      deposit_paid: true,
    };

    const eqMocks: Array<{ field: string; value: string }> = [];
    let call = 0;
    const fromMock = jest.fn(() => {
      call += 1;
      const api: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
      api.select = jest.fn(() => api);
      api.update = jest.fn(() => api);
      api.eq = jest.fn((field: string, value: string) => {
        eqMocks.push({ field, value });
        return api;
      });
      api.maybeSingle = jest.fn(async () => {
        if (call === 1) {
          return { data: pendingAppointment, error: null };
        }
        return { data: updateData, error: null };
      });
      return api;
    });

    const service = new DepositPaymentService({
      getClient: () => ({ from: fromMock }),
    } as unknown as SupabaseService);

    const result = await service.confirmDepositPayment('appt-1');

    expect(result.outcome).toBe('confirmed');
    expect(result.appointment?.status).toBe('CONFIRMED');
    expect(
      eqMocks.some(
        (e) => e.field === 'status' && e.value === 'PENDING_PAYMENT',
      ),
    ).toBe(true);
  });

  it('returns late_payment_needs_refund for cancelled appointments', async () => {
    const cancelled = {
      ...pendingAppointment,
      status: 'CANCELLED',
    } as Appointment;

    const fromMock = jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(async () => ({ data: cancelled, error: null })),
    }));

    const service = new DepositPaymentService({
      getClient: () => ({ from: fromMock }),
    } as unknown as SupabaseService);

    const result = await service.confirmDepositPayment('appt-1');

    expect(result.outcome).toBe('late_payment_needs_refund');
    expect(result.appointment?.status).toBe('CANCELLED');
  });

  it('returns already_confirmed for paid confirmed appointments', async () => {
    const confirmed = {
      ...pendingAppointment,
      status: 'CONFIRMED',
      payment_status: 'PAID',
      deposit_paid: true,
    } as Appointment;

    const fromMock = jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(async () => ({ data: confirmed, error: null })),
    }));

    const service = new DepositPaymentService({
      getClient: () => ({ from: fromMock }),
    } as unknown as SupabaseService);

    const result = await service.confirmDepositPayment('appt-1');

    expect(result.outcome).toBe('already_confirmed');
  });

  it('throws when supabase returns an error on find', async () => {
    const fromMock = jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(async () => ({
        data: null,
        error: { message: 'db down' },
      })),
    }));

    const service = new DepositPaymentService({
      getClient: () => ({ from: fromMock }),
    } as unknown as SupabaseService);

    await expect(
      service.confirmDepositPayment('appt-1'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
