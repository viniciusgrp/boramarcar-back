import {
  normalizeAdminThemeMode,
  normalizeTenantUserPreferences,
} from './tenant-user-preferences.util';

describe('tenant-user-preferences.util', () => {
  it('falls back to light mode', () => {
    expect(normalizeAdminThemeMode('dark')).toBe('dark');
    expect(normalizeAdminThemeMode('nope')).toBe('light');
  });

  it('normalizes incomplete preference objects', () => {
    expect(normalizeTenantUserPreferences(null)).toEqual({
      admin_theme_mode: 'light',
    });
  });
});
