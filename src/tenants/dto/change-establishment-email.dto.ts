import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ChangeEstablishmentEmailDto {
  @IsEmail()
  current_email!: string;

  @IsEmail()
  new_email!: string;

  @IsString()
  @IsNotEmpty()
  recaptcha_token!: string;
}
