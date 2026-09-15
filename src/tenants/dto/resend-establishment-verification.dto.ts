import { IsEmail, IsOptional, IsString } from 'class-validator';

export class ResendEstablishmentVerificationDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  recaptcha_token?: string;
}
