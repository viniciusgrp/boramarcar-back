import { IsEmail, IsOptional, IsString } from 'class-validator';

export class ChangeEstablishmentEmailDto {
  @IsEmail()
  current_email!: string;

  @IsEmail()
  new_email!: string;

  @IsOptional()
  @IsString()
  recaptcha_token?: string;
}
