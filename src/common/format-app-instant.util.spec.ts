import { formatAppInstantAsWallClockIso } from './format-app-instant.util';

describe('formatAppInstantAsWallClockIso', () => {
  it('maps a real UTC instant to America/Sao_Paulo wall-clock digits', () => {
    // 16:00 UTC = 13:00 in America/Sao_Paulo (UTC-3, no DST).
    expect(formatAppInstantAsWallClockIso('2026-11-14T16:00:00.000Z')).toBe(
      '2026-11-14T13:00:00.000Z',
    );
  });

  it('returns empty for blank input and keeps unparseable strings', () => {
    expect(formatAppInstantAsWallClockIso(null)).toBe('');
    expect(formatAppInstantAsWallClockIso('not-a-date')).toBe('not-a-date');
  });
});
