import {
  buildFinanceReportSummary,
  isValidFinanceReportStatus,
  mapFinanceReportAppointmentRow,
} from './finance-report-mapper.util';

describe('finance-report-mapper.util', () => {
  it('accepts known appointment statuses', () => {
    expect(isValidFinanceReportStatus('CONFIRMED')).toBe(true);
    expect(isValidFinanceReportStatus('NOPE')).toBe(false);
  });

  it('maps rows and totals revenue minus commissions', () => {
    const appointment = mapFinanceReportAppointmentRow({
      id: 'appt-1',
      professional_id: 'pro-1',
      service_id: 'svc-1',
      customer_id: 'cust-1',
      customer_name: 'Ana',
      customer_phone: '1199',
      start_time: '2026-09-08T10:00:00.000Z',
      end_time: '2026-09-08T11:00:00.000Z',
      status: 'COMPLETED',
      total_price: 100,
      commission_amount: 20,
      booking_source: 'INTERNAL',
      professionals: { name: 'João' },
      services: { name: 'Corte' },
    });

    expect(appointment.bookingSource).toBe('INTERNAL');
    expect(buildFinanceReportSummary([appointment])).toEqual({
      totalRevenue: 100,
      totalCommissions: 20,
      netProfit: 80,
      appointmentCount: 1,
    });
  });
});
