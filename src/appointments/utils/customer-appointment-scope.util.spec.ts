import {
  isUpcomingCustomerAppointment,
  matchesCustomerAppointmentScope,
} from './customer-appointment-scope.util';

describe('customer-appointment-scope.util', () => {
  const now = new Date(2026, 6, 16, 14, 0, 0);

  it('keeps confirmed future wall-clock slots in upcoming', () => {
    expect(
      isUpcomingCustomerAppointment(
        {
          status: 'CONFIRMED',
          start_time: '2026-07-16T15:00:00.000Z',
        },
        now,
      ),
    ).toBe(true);
  });

  it('moves past wall-clock starts to past even when status is confirmed', () => {
    expect(
      matchesCustomerAppointmentScope(
        {
          status: 'CONFIRMED',
          start_time: '2026-07-16T13:00:00.000Z',
        },
        'past',
        now,
      ),
    ).toBe(true);
  });

  it('never treats completed appointments as upcoming', () => {
    expect(
      isUpcomingCustomerAppointment(
        {
          status: 'COMPLETED',
          start_time: '2026-07-16T18:00:00.000Z',
        },
        now,
      ),
    ).toBe(false);
  });
});
