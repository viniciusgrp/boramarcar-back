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

  it('keeps cancelled rows out of revenue, profit and appointment count', () => {
    const row = {
      professional_id: 'pro-1',
      service_id: 'svc-1',
      customer_id: 'cust-1',
      customer_phone: '1199',
      start_time: '2026-09-08T10:00:00.000Z',
      end_time: '2026-09-08T11:00:00.000Z',
      booking_source: 'INTERNAL' as const,
      professionals: { name: 'João' },
      services: { name: 'Corte' },
    };
    const completed = mapFinanceReportAppointmentRow({
      ...row,
      id: 'appt-done',
      customer_name: 'Ana',
      status: 'COMPLETED',
      total_price: 100,
      commission_amount: 20,
    });
    const cancelled = mapFinanceReportAppointmentRow({
      ...row,
      id: 'appt-cancelled',
      customer_name: 'Beto',
      status: 'CANCELLED',
      total_price: 45,
      commission_amount: 9,
    });

    expect(buildFinanceReportSummary([completed, cancelled])).toEqual({
      totalRevenue: 100,
      totalCommissions: 20,
      netProfit: 80,
      appointmentCount: 1,
    });
  });
});
