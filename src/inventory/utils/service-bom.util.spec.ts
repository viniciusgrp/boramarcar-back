import {
  aggregateBomQuantitiesByProduct,
  resolveAppointmentServiceIds,
} from './service-bom.util';

describe('aggregateBomQuantitiesByProduct', () => {
  it('sums quantities for the same product across services', () => {
    expect(
      aggregateBomQuantitiesByProduct([
        { serviceId: 's1', productId: 'p1', quantity: 2 },
        { serviceId: 's2', productId: 'p1', quantity: 3 },
        { serviceId: 's2', productId: 'p2', quantity: 1 },
      ]),
    ).toEqual([
      { productId: 'p1', quantity: 5 },
      { productId: 'p2', quantity: 1 },
    ]);
  });

  it('ignores invalid product ids and non-positive quantities', () => {
    expect(
      aggregateBomQuantitiesByProduct([
        { serviceId: 's1', productId: '  ', quantity: 2 },
        { serviceId: 's1', productId: 'p1', quantity: 0 },
        { serviceId: 's1', productId: 'p2', quantity: 1.5 },
        { serviceId: 's1', productId: 'p3', quantity: 4 },
      ]),
    ).toEqual([{ productId: 'p3', quantity: 4 }]);
  });

  it('returns an empty list when there are no valid lines', () => {
    expect(aggregateBomQuantitiesByProduct([])).toEqual([]);
  });
});

describe('resolveAppointmentServiceIds', () => {
  it('prefers appointment_services junction rows', () => {
    expect(
      resolveAppointmentServiceIds({
        appointmentServices: [
          { service_id: 'a' },
          { service_id: 'b' },
          { service_id: 'a' },
        ],
        primaryServiceId: 'legacy',
      }),
    ).toEqual(['a', 'b']);
  });

  it('falls back to the legacy primary service_id', () => {
    expect(
      resolveAppointmentServiceIds({
        appointmentServices: [],
        primaryServiceId: 'legacy',
      }),
    ).toEqual(['legacy']);
  });
});
