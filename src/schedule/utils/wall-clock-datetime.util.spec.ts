import {
  buildWallClockDateTime,
  combineWallClockDayAndTime,
  formatWallClockDate,
  isSameWallClockDay,
  parseWallClockDateTime,
  wallClockToStorageIso,
} from './wall-clock-datetime.util';

describe('wall-clock-datetime.util', () => {
  it('parses storage ISO as naive wall-clock from the UTC component', () => {
    const parsed = parseWallClockDateTime('2026-09-08T17:30:00.000Z');
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(8);
    expect(parsed.getDate()).toBe(8);
    expect(parsed.getHours()).toBe(17);
    expect(parsed.getMinutes()).toBe(30);
  });

  it('parses naive timestamps without timezone as local wall-clock', () => {
    const parsed = parseWallClockDateTime('2026-09-08T09:00:00');
    expect(parsed.getHours()).toBe(9);
    expect(parsed.getMinutes()).toBe(0);
  });

  it('builds and combines wall-clock day and time', () => {
    const built = buildWallClockDateTime('2026-09-08', '14:45');
    expect(formatWallClockDate(built)).toBe('2026-09-08');
    expect(built.getHours()).toBe(14);
    expect(built.getMinutes()).toBe(45);

    const combined = combineWallClockDayAndTime(built, '08:15');
    expect(combined.getHours()).toBe(8);
    expect(combined.getMinutes()).toBe(15);
  });

  it('serializes wall-clock dates as UTC-looking storage ISO', () => {
    const date = buildWallClockDateTime('2026-09-08', '17:30');
    expect(wallClockToStorageIso(date)).toBe('2026-09-08T17:30:00.000Z');
  });

  it('compares civil days', () => {
    const morning = buildWallClockDateTime('2026-09-08', '08:00');
    const evening = buildWallClockDateTime('2026-09-08', '23:00');
    const nextDay = buildWallClockDateTime('2026-09-09', '00:00');
    expect(isSameWallClockDay(morning, evening)).toBe(true);
    expect(isSameWallClockDay(morning, nextDay)).toBe(false);
  });
});
