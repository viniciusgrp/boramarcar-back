import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ResendEstablishmentVerificationDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  recaptcha_token!: string;
}
