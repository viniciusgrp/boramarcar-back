import {
  resolveAppointmentPaymentView,
  resolveInitialPaymentStatus,
} from './appointment-payment.util';

describe('appointment payment view', () => {
  it('uses NOT_REQUIRED when the booking has no deposit', () => {
    expect(resolveInitialPaymentStatus(false)).toBe('NOT_REQUIRED');
    expect(resolveInitialPaymentStatus(true)).toBe('PENDING');
  });

  it('exposes total, paid deposit and remaining balance', () => {
    expect(
      resolveAppointmentPaymentView({
        status: 'CONFIRMED',
        totalPrice: 80,
        depositAmount: 20,
        depositPaid: true,
        paymentStatus: 'PAID',
      }),
    ).toMatchObject({
      totalPrice: 80,
      depositPaidAmount: 20,
      balanceDue: 60,
      paymentStatus: 'PAID',
      paymentBadge: 'DEPOSIT_PAID',
    });
  });

  it('marks the appointment paid when the deposit covers the total', () => {
    expect(
      resolveAppointmentPaymentView({
        status: 'CONFIRMED',
        totalPrice: 40,
        depositAmount: 40,
        depositPaid: true,
        paymentStatus: 'PAID',
      }).paymentBadge,
    ).toBe('PAID');
  });

  it('clears the balance after completion and shows the paid badge', () => {
    expect(
      resolveAppointmentPaymentView({
        status: 'COMPLETED',
        totalPrice: 80,
        depositAmount: 20,
        depositPaid: true,
        paymentStatus: 'PAID',
      }),
    ).toMatchObject({
      balanceDue: 0,
      paymentBadge: 'PAID',
    });
  });

  it('hides the payment badge when nothing was collected', () => {
    expect(
      resolveAppointmentPaymentView({
        status: 'CONFIRMED',
        totalPrice: 40,
        depositAmount: null,
        depositPaid: false,
        paymentStatus: 'NOT_REQUIRED',
      }).paymentBadge,
    ).toBe('NONE');
  });
});
