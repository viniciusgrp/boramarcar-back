import {
  CALENDAR_SUMMARY_CARD_KEYS,
  DEFAULT_CALENDAR_CARD_PREFERENCES,
  type CalendarCardPreferences,
} from '../entities/calendar-card-preferences.type';

export function normalizeCalendarCardPreferences(
  value: unknown,
): CalendarCardPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_CALENDAR_CARD_PREFERENCES };
  }

  const record = value as Record<string, unknown>;

  return CALENDAR_SUMMARY_CARD_KEYS.reduce<CalendarCardPreferences>(
    (preferences, key) => {
      const fallback = DEFAULT_CALENDAR_CARD_PREFERENCES[key];
      preferences[key] =
        typeof record[key] === 'boolean' ? record[key] : fallback;
      return preferences;
    },
    { ...DEFAULT_CALENDAR_CARD_PREFERENCES },
  );
}
