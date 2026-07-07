import type { AdminThemeMode } from '../entities/tenant-user-preferences.type';

export class UpdateTenantUserPreferencesDto {
  adminThemeMode!: AdminThemeMode;
}
