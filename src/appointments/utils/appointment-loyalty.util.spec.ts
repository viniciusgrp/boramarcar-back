import { calculateAppointmentLoyaltyPoints } from '../../services/utils/service-loyalty-points.util';
import { buildAppointmentCommissionServiceLines } from './appointment-commission.util';
import {
  applyCouponDiscountToLoyaltyPrices,
  buildAppointmentLoyaltyServiceLines,
} from './appointment-loyalty.util';

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

  it('prorates the coupon before currency points and keeps fixed points', () => {
    const lines = applyCouponDiscountToLoyaltyPrices(
      [
        { price: 40, loyaltyPointsEarned: null },
        { price: 40, loyaltyPointsEarned: 12 },
      ],
      4,
    );

    expect(lines[0]?.price).toBe(38);
    expect(lines[1]).toEqual({ price: 38, loyaltyPointsEarned: 12 });
    expect(calculateAppointmentLoyaltyPoints(lines, 1, 0)).toBe(50);
  });

  it('awards points on the charged amount for a single discounted service', () => {
    const lines = applyCouponDiscountToLoyaltyPrices(
      [{ price: 40, loyaltyPointsEarned: null }],
      4,
    );

    expect(calculateAppointmentLoyaltyPoints(lines, 1, 0)).toBe(36);
  });

  it('leaves affiliate and professional commission on the full price', () => {
    expect(
      buildAppointmentCommissionServiceLines({
        service_id: 'svc-1',
        total_price: 36,
        appointment_services: [{ service_id: 'svc-1', price: 40, services: null }],
      }),
    ).toEqual([
      { serviceId: 'svc-1', price: 40, customCommissionRate: null },
    ]);
  });
});
