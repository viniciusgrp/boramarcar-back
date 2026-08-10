import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DepositPaymentService } from './deposit-payment.service';

describe('DepositPaymentService.releasePendingDepositHoldWithAccessToken', () => {
  const appointmentId = '11111111-1111-1111-1111-111111111111';
  const validToken = 'a'.repeat(64);

  function buildService(opts: {
    row?: Record<string, unknown> | null;
    updateData?: { id: string } | null;
  }) {
    const maybeSingleFind = jest.fn().mockResolvedValue({
      data: opts.row === undefined ? null : opts.row,
      error: null,
    });
    const maybeSingleUpdate = jest.fn().mockResolvedValue({
      data: opts.updateData === undefined ? { id: appointmentId } : opts.updateData,
      error: null,
    });

    const from = jest.fn((table: string) => {
      if (table !== 'appointments') {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: maybeSingleFind,
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                maybeSingle: maybeSingleUpdate,
              }),
            }),
          }),
        }),
      };
    });

    const supabaseService = {
      getClient: () => ({ from }),
    };

    const service = new DepositPaymentService(supabaseService as never);
    return { service, maybeSingleFind, maybeSingleUpdate };
  }

  it('rejects missing appointment', async () => {
    const { service } = buildService({ row: null });

    await expect(
      service.releasePendingDepositHoldWithAccessToken(appointmentId, validToken),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects wrong access token', async () => {
    const { service, maybeSingleUpdate } = buildService({
      row: {
        id: appointmentId,
        status: 'PENDING_PAYMENT',
        guest_access_token: validToken,
      },
    });

    await expect(
      service.releasePendingDepositHoldWithAccessToken(
        appointmentId,
        'b'.repeat(64),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(maybeSingleUpdate).not.toHaveBeenCalled();
  });

  it('rejects when appointment has no guest_access_token', async () => {
    const { service } = buildService({
      row: {
        id: appointmentId,
        status: 'PENDING_PAYMENT',
        guest_access_token: null,
      },
    });

    await expect(
      service.releasePendingDepositHoldWithAccessToken(appointmentId, validToken),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('releases hold when token matches', async () => {
    const { service } = buildService({
      row: {
        id: appointmentId,
        status: 'PENDING_PAYMENT',
        guest_access_token: validToken,
      },
      updateData: { id: appointmentId },
    });

    await expect(
      service.releasePendingDepositHoldWithAccessToken(appointmentId, validToken),
    ).resolves.toBe(true);
  });
});
