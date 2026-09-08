import { intersectSchedules, type DayScheduleWindow } from './intersect-schedules.util';

function window(
  openHour: number,
  closeHour: number,
  isClosed = false,
): DayScheduleWindow {
  return {
    isClosed,
    openAt: new Date(2026, 8, 8, openHour, 0, 0),
    closeAt: new Date(2026, 8, 8, closeHour, 0, 0),
  };
}

describe('intersect-schedules.util', () => {
  it('returns business hours when professional schedule is missing', () => {
    const business = window(9, 18);
    expect(intersectSchedules(business, null)).toEqual(business);
  });

  it('returns closed business as-is', () => {
    const closed = window(9, 18, true);
    expect(intersectSchedules(closed, window(10, 17))).toEqual(closed);
  });

  it('returns null when business is null', () => {
    expect(intersectSchedules(null, window(9, 18))).toBeNull();
  });

  it('marks the day closed when the professional is closed', () => {
    const business = window(9, 18);
    const result = intersectSchedules(business, window(10, 17, true));
    expect(result?.isClosed).toBe(true);
    expect(result?.openAt).toEqual(business.openAt);
  });

  it('intersects overlapping windows', () => {
    const result = intersectSchedules(window(9, 18), window(10, 16));
    expect(result?.isClosed).toBe(false);
    expect(result?.openAt.getHours()).toBe(10);
    expect(result?.closeAt.getHours()).toBe(16);
  });

  it('treats a non-overlapping professional window as closed', () => {
    const business = window(9, 12);
    const result = intersectSchedules(business, window(14, 18));
    expect(result?.isClosed).toBe(true);
  });
});
