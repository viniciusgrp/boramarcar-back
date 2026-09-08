import { AppointmentsController } from './appointments.controller';

describe('AppointmentsController', () => {
  it('creates a public appointment through the service', async () => {
    const appointmentsService = {
      create: jest.fn().mockResolvedValue({ appointment: { id: 'appt-1' } }),
    };
    const controller = new AppointmentsController(appointmentsService as never);

    await expect(
      controller.create({
        tenantId: 'tenant-1',
        professionalId: 'pro-1',
        startTime: '2099-01-15T09:00:00.000Z',
        customerName: 'Ana',
        customerPhone: '11999999999',
        serviceIds: ['svc-1'],
      }),
    ).resolves.toEqual({ appointment: { id: 'appt-1' } });
    expect(appointmentsService.create).toHaveBeenCalled();
  });
});
