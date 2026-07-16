import {
  doTimeRangesOverlap,
  isBookingOverlapConstraintError,
  POSTGRES_EXCLUSION_VIOLATION,
} from './booking-slot-overlap.util';

describe('booking-slot-overlap.util', () => {
  const t = (hour: number, minute = 0) =>
    new Date(`2026-07-16T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);

  it('detects overlapping ranges', () => {
    expect(doTimeRangesOverlap(t(10), t(11), t(10, 30), t(11, 30))).toBe(true);
    expect(doTimeRangesOverlap(t(10), t(11), t(11), t(12))).toBe(false);
    expect(doTimeRangesOverlap(t(10), t(11), t(9), t(10))).toBe(false);
  });

  it('recognizes Postgres exclusion violations', () => {
    expect(
      isBookingOverlapConstraintError({ code: POSTGRES_EXCLUSION_VIOLATION }),
    ).toBe(true);
    expect(
      isBookingOverlapConstraintError({
        message: 'conflict on constraint appointments_no_overlapping_slots',
      }),
    ).toBe(true);
    expect(isBookingOverlapConstraintError({ code: '23505' })).toBe(false);
  });
});
