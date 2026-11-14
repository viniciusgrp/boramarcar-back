import {
  buildFinanceReportSummary,
  isValidFinanceReportStatus,
  mapFinanceReportAppointmentRow,
  mapFinanceReportProductSale,
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
    expect(appointment.recognizedRevenue).toBe(100);
    expect(buildFinanceReportSummary([appointment])).toEqual({
      totalRevenue: 100,
      serviceRevenue: 100,
      productRevenue: 0,
      totalCommissions: 20,
      serviceCommissions: 20,
      productCommissions: 0,
      netProfit: 80,
      appointmentCount: 1,
      productSaleCount: 0,
    });
  });

  it('keeps future confirmed and cancelled rows out of billing', () => {
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
    const confirmed = mapFinanceReportAppointmentRow({
      ...row,
      id: 'appt-future',
      customer_name: 'Carla',
      status: 'CONFIRMED',
      total_price: 80,
      commission_amount: 0,
    });
    const cancelled = mapFinanceReportAppointmentRow({
      ...row,
      id: 'appt-cancelled',
      customer_name: 'Beto',
      status: 'CANCELLED',
      total_price: 45,
      commission_amount: 9,
    });

    expect(confirmed.countsTowardRevenue).toBe(false);
    expect(confirmed.recognizedRevenue).toBe(0);
    expect(cancelled.recognizedRevenue).toBe(0);
    expect(cancelled.countsTowardRevenue).toBe(false);
    const productSale = mapFinanceReportProductSale({
      id: 'sale-1',
      created_at: '2026-09-08T12:00:00.000Z',
      status: 'COMPLETED',
      customer_name: 'Ana',
      professional_id: 'pro-1',
      total_amount: 25,
      commission_amount: 5,
      professionals: { name: 'João' },
    });
    expect(
      buildFinanceReportSummary(
        [completed, confirmed, cancelled],
        [productSale],
      ),
    ).toEqual({
      totalRevenue: 125,
      serviceRevenue: 100,
      productRevenue: 25,
      totalCommissions: 25,
      serviceCommissions: 20,
      productCommissions: 5,
      netProfit: 100,
      appointmentCount: 1,
      productSaleCount: 1,
    });
  });

  it('keeps sale createdAt as UTC ISO and appointmentStartTime unshifted (B4)', () => {
    const productSale = mapFinanceReportProductSale({
      id: 'sale-1',
      created_at: '2026-09-10T18:00:00.000Z',
      status: 'COMPLETED',
      total_amount: 25,
      commission_amount: 5,
      appointments: { start_time: '2026-09-08T14:00:00.000Z' },
    });

    expect(productSale.createdAt).toBe('2026-09-10T18:00:00.000Z');
    expect(productSale.appointmentStartTime).toBe('2026-09-08T14:00:00.000Z');
  });

  it('leaves appointmentStartTime null for standalone sales', () => {
    const productSale = mapFinanceReportProductSale({
      id: 'sale-2',
      created_at: '2026-09-10T18:00:00.000Z',
      status: 'COMPLETED',
      total_amount: 10,
      commission_amount: 0,
    });

    expect(productSale.appointmentStartTime).toBeNull();
    expect(productSale.createdAt).toBe('2026-09-10T18:00:00.000Z');
  });
});
