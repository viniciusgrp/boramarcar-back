import { buildAppointmentCommissionServiceLines } from './appointment-commission.util';

describe('appointment-commission.util', () => {
  it('uses junction rows when present', () => {
    expect(
      buildAppointmentCommissionServiceLines({
        service_id: 'svc-1',
        total_price: 80,
        appointment_services: [
          {
            service_id: 'svc-2',
            price: 40,
            services: { custom_commission_rate: 10 },
          },
        ],
      }),
    ).toEqual([
      { serviceId: 'svc-2', price: 40, customCommissionRate: 10 },
    ]);
  });

  it('falls back to the primary service', () => {
    expect(
      buildAppointmentCommissionServiceLines({
        service_id: 'svc-1',
        total_price: 50,
        services: { custom_commission_rate: null, price: 50 },
      }),
    ).toEqual([
      { serviceId: 'svc-1', price: 50, customCommissionRate: null },
    ]);
  });
});
