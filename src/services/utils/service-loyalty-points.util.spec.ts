import { calculateAppointmentLoyaltyPoints } from './service-loyalty-points.util';

describe('service-loyalty-points.util', () => {
  it('prefers per-service points over currency conversion', () => {
    expect(
      calculateAppointmentLoyaltyPoints(
        [
          { price: 100, loyaltyPointsEarned: 8 },
          { price: 50, loyaltyPointsEarned: null },
        ],
        1,
        3,
      ),
    ).toBe(58);
  });
});
