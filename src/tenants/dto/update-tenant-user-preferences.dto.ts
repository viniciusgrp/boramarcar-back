import { IsEnum } from 'class-validator';
import {
  ADMIN_THEME_MODES,
  type AdminThemeMode,
} from '../entities/tenant-user-preferences.type';

export class UpdateTenantUserPreferencesDto {
  @IsEnum(ADMIN_THEME_MODES)
  adminThemeMode!: AdminThemeMode;
}
