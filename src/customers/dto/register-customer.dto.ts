import { IsEmail, IsString, IsUUID, MinLength } from 'class-validator';

export class RegisterCustomerDto {
  @IsUUID()
  tenantId!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
