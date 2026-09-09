import { buildAppointmentLoyaltyServiceLines } from './appointment-loyalty.util';

describe('appointment-loyalty.util', () => {
  it('maps junction loyalty points', () => {
    expect(
      buildAppointmentLoyaltyServiceLines({
        service_id: 'svc-1',
        total_price: 80,
        appointment_services: [
          { price: 40, services: { loyalty_points_earned: 12 } },
        ],
      }),
    ).toEqual([{ price: 40, loyaltyPointsEarned: 12 }]);
  });
});
