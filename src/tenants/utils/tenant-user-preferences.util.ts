import {
  DEFAULT_TENANT_USER_PREFERENCES,
  type AdminThemeMode,
  type TenantUserPreferences,
} from '../entities/tenant-user-preferences.type';

export function normalizeAdminThemeMode(
  value: string | null | undefined,
): AdminThemeMode {
  return value === 'dark' ? 'dark' : 'light';
}

export function normalizeTenantUserPreferences(
  value: TenantUserPreferences | Record<string, unknown> | null | undefined,
): TenantUserPreferences {
  if (!value || typeof value !== 'object') {
    return DEFAULT_TENANT_USER_PREFERENCES;
  }

  return {
    admin_theme_mode: normalizeAdminThemeMode(
      typeof value.admin_theme_mode === 'string'
        ? value.admin_theme_mode
        : undefined,
    ),
  };
}
