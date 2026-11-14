import {
  ASAAS_MIN_CHARGE_BRL,
  calendarDaysBetween,
  paidPeriodDates,
  quotePlanChange,
} from './plan-change-proration.util';

describe('plan change proration', () => {
  it('counts whole calendar days between Asaas dates', () => {
    expect(calendarDaysBetween('2026-11-27', '2026-12-27')).toBe(30);
    expect(calendarDaysBetween('2026-12-12', '2026-12-27')).toBe(15);
  });

  it('uses the Sao Paulo month that ends on subscription_expires_at', () => {
    expect(
      paidPeriodDates('2026-12-27T03:00:00.000Z', new Date('2026-12-12T15:00:00.000Z')),
    ).toEqual({
      periodStartDate: '2026-11-27',
      periodEndDate: '2026-12-27',
      todayDate: '2026-12-12',
    });
  });

  it('charges the difference times remaining days over the period, in cents', () => {
    const quote = quotePlanChange({
      currentMonthlyValueBrl: 69.9,
      targetMonthlyValueBrl: 120,
      periodStartDate: '2026-11-27',
      periodEndDate: '2026-12-27',
      todayDate: '2026-12-12',
    });

    expect(quote.direction).toBe('upgrade');
    expect(quote.daysInPeriod).toBe(30);
    expect(quote.remainingDays).toBe(15);
    expect(quote.proratedAmountBrl).toBe(25.05);
    expect(quote.chargeAmountBrl).toBe(25.05);
    expect(quote.belowAsaasMinimum).toBe(false);
  });

  it('does not charge an upgrade below the Asaas minimum', () => {
    const quote = quotePlanChange({
      currentMonthlyValueBrl: 34.9,
      targetMonthlyValueBrl: 69.9,
      periodStartDate: '2026-11-27',
      periodEndDate: '2026-12-27',
      todayDate: '2026-12-26',
    });

    expect(quote.proratedAmountBrl).toBe(1.17);
    expect(quote.proratedAmountBrl).toBeLessThan(ASAAS_MIN_CHARGE_BRL);
    expect(quote.chargeAmountBrl).toBe(0);
    expect(quote.belowAsaasMinimum).toBe(true);
  });

  it('caps remaining days at the length of the paid period', () => {
    const quote = quotePlanChange({
      currentMonthlyValueBrl: 69.9,
      targetMonthlyValueBrl: 120,
      periodStartDate: '2026-11-27',
      periodEndDate: '2026-12-27',
      todayDate: '2026-11-13',
    });

    expect(quote.remainingDays).toBe(30);
    expect(quote.chargeAmountBrl).toBe(50.1);
  });

  it('does not prorate a downgrade', () => {
    expect(
      quotePlanChange({
        currentMonthlyValueBrl: 120,
        targetMonthlyValueBrl: 69.9,
        periodStartDate: '2026-11-27',
        periodEndDate: '2026-12-27',
        todayDate: '2026-12-12',
      }),
    ).toMatchObject({
      direction: 'downgrade',
      proratedAmountBrl: null,
      chargeAmountBrl: 0,
    });
  });
});
