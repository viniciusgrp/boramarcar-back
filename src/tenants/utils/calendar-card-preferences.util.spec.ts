import { DEFAULT_CALENDAR_CARD_PREFERENCES } from '../entities/calendar-card-preferences.type';
import { normalizeCalendarCardPreferences } from './calendar-card-preferences.util';

describe('calendar-card-preferences.util', () => {
  it('falls back to defaults for invalid payloads', () => {
    expect(normalizeCalendarCardPreferences(null)).toEqual(
      DEFAULT_CALENDAR_CARD_PREFERENCES,
    );
  });

  it('keeps boolean overrides', () => {
    expect(
      normalizeCalendarCardPreferences({ dayRevenue: true, pending: false }),
    ).toMatchObject({
      dayRevenue: true,
      pending: false,
    });
  });
});
