import { IsEmail, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateAsaasAccountDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  cpfCnpj!: string;

  @IsNumber()
  @Min(0)
  incomeValue!: number;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  mobilePhone?: string;

  @IsString()
  address!: string;

  @IsString()
  addressNumber!: string;

  @IsOptional()
  @IsString()
  complement?: string;

  @IsString()
  province!: string;

  @IsString()
  postalCode!: string;
}
