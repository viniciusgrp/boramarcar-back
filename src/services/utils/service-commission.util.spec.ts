import {
  calculateAppointmentCommissionAmount,
  isValidCustomCommissionRate,
  resolveCommissionPercentForServiceLine,
} from './service-commission.util';

describe('service-commission.util', () => {
  it('validates custom rates between 0 and 100', () => {
    expect(isValidCustomCommissionRate(10)).toBe(true);
    expect(isValidCustomCommissionRate(101)).toBe(false);
    expect(isValidCustomCommissionRate(null)).toBe(false);
  });

  it('prefers the service rate over the professional default', () => {
    expect(resolveCommissionPercentForServiceLine(20, 50)).toBe(20);
    expect(resolveCommissionPercentForServiceLine(null, 15)).toBe(15);
  });

  it('sums commission per service line', () => {
    expect(
      calculateAppointmentCommissionAmount(
        [
          { serviceId: 'a', price: 100, customCommissionRate: 10 },
          { serviceId: 'b', price: 50, customCommissionRate: null },
        ],
        20,
      ),
    ).toBe(20);
  });
});
