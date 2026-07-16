import { IsString, Matches } from 'class-validator';

export class UpdateTenantAdminThemeDto {
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  secondaryColorLight!: string;

  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  secondaryColorDark!: string;
}
