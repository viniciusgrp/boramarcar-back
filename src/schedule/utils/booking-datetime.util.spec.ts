import {
  bookingDayBoundsIso,
  bookingWallClockToInstantIso,
  formatBookingLocalIso,
  parseBookingDateTime,
  resolveBookingTimeZone,
  storedBookingInstantToWallClock,
} from './booking-datetime.util';

describe('booking-datetime.util', () => {
  it('defaults a missing or invalid tenant timezone to America/Sao_Paulo', () => {
    expect(resolveBookingTimeZone(null)).toBe('America/Sao_Paulo');
    expect(resolveBookingTimeZone('  ')).toBe('America/Sao_Paulo');
    expect(resolveBookingTimeZone('Not/AZone')).toBe('America/Sao_Paulo');
    expect(resolveBookingTimeZone('America/Manaus')).toBe('America/Manaus');
  });

  it('interprets a naive booking time as the tenant local clock and stores the UTC instant', () => {
    const wallClock = parseBookingDateTime('2026-11-14T10:00:00');

    expect(wallClock.getFullYear()).toBe(2026);
    expect(wallClock.getMonth()).toBe(10);
    expect(wallClock.getDate()).toBe(14);
    expect(wallClock.getHours()).toBe(10);
    expect(wallClock.getMinutes()).toBe(0);
    expect(bookingWallClockToInstantIso(wallClock)).toBe(
      '2026-11-14T13:00:00.000Z',
    );
  });

  it('uses the tenant timezone when one is configured', () => {
    const wallClock = parseBookingDateTime(
      '2026-11-14T10:00:00',
      'America/Manaus',
    );

    expect(wallClock.getHours()).toBe(10);
    expect(bookingWallClockToInstantIso(wallClock, 'America/Manaus')).toBe(
      '2026-11-14T14:00:00.000Z',
    );
  });

  it('keeps explicit offsets and Z as absolute instants', () => {
    const fromOffset = parseBookingDateTime('2026-11-14T10:00:00-03:00');
    const fromZ = parseBookingDateTime('2026-11-14T13:00:00.000Z');
    const fromUtc = parseBookingDateTime('2026-11-14T10:00:00Z');

    expect(fromOffset.getHours()).toBe(10);
    expect(fromZ.getHours()).toBe(10);
    expect(bookingWallClockToInstantIso(fromOffset)).toBe(
      '2026-11-14T13:00:00.000Z',
    );
    expect(bookingWallClockToInstantIso(fromZ)).toBe(
      '2026-11-14T13:00:00.000Z',
    );
    expect(fromUtc.getHours()).toBe(7);
    expect(bookingWallClockToInstantIso(fromUtc)).toBe(
      '2026-11-14T10:00:00.000Z',
    );
  });

  it('round-trips a stored instant back to the same local slot', () => {
    const booked = bookingWallClockToInstantIso(
      parseBookingDateTime('2026-11-14T10:00:00'),
    );
    const readBack = storedBookingInstantToWallClock(booked);

    expect(booked).toBe('2026-11-14T13:00:00.000Z');
    expect(readBack.getHours()).toBe(10);
    expect(readBack.getMinutes()).toBe(0);
    expect(formatBookingLocalIso(booked)).toBe('2026-11-14T10:00:00.000-03:00');
  });

  it('bounds a civil day by the tenant timezone, including late evening', () => {
    expect(bookingDayBoundsIso('2026-11-14')).toEqual({
      start: '2026-11-14T03:00:00.000Z',
      end: '2026-11-15T02:59:59.000Z',
    });
  });
});
