import {
  DEFAULT_ADMIN_SECONDARY_COLOR_LIGHT,
  normalizeAdminThemeColor,
} from './admin-theme.util';

describe('admin-theme.util', () => {
  it('accepts hex colors and falls back otherwise', () => {
    expect(normalizeAdminThemeColor('#AABBCC', DEFAULT_ADMIN_SECONDARY_COLOR_LIGHT)).toBe(
      '#aabbcc',
    );
    expect(
      normalizeAdminThemeColor('red', DEFAULT_ADMIN_SECONDARY_COLOR_LIGHT),
    ).toBe(DEFAULT_ADMIN_SECONDARY_COLOR_LIGHT);
  });
});
