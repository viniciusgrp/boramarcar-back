import { resolveInitialAppointmentStatus } from './resolve-initial-appointment-status.util';

describe('resolve-initial-appointment-status.util', () => {
  it('prioritizes deposit over manual approval', () => {
    expect(
      resolveInitialAppointmentStatus({
        requiresDepositPayment: true,
        isPaidWithPoints: false,
        bookingAcceptanceType: 'MANUAL',
      }),
    ).toBe('PENDING_PAYMENT');
  });

  it('uses PENDING_APPROVAL for manual acceptance without deposit', () => {
    expect(
      resolveInitialAppointmentStatus({
        requiresDepositPayment: false,
        isPaidWithPoints: false,
        bookingAcceptanceType: 'MANUAL',
      }),
    ).toBe('PENDING_APPROVAL');
  });

  it('confirms automatic bookings without deposit', () => {
    expect(
      resolveInitialAppointmentStatus({
        requiresDepositPayment: false,
        isPaidWithPoints: true,
        bookingAcceptanceType: 'AUTOMATIC',
      }),
    ).toBe('CONFIRMED');
  });
});
