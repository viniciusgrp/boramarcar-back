export const ADMIN_THEME_MODES = ['light', 'dark'] as const;

export type AdminThemeMode = (typeof ADMIN_THEME_MODES)[number];

export interface TenantUserPreferences {
  admin_theme_mode: AdminThemeMode;
}

export const DEFAULT_TENANT_USER_PREFERENCES: TenantUserPreferences = {
  admin_theme_mode: 'light',
};
