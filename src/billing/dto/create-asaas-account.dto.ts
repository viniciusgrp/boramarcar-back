import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import type { AsaasCompanyType } from '../../asaas/asaas.types';

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

  /** Required by Asaas when cpfCnpj is a CPF (11 digits). Format: YYYY-MM-DD. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'birthDate must be an ISO date (YYYY-MM-DD)',
  })
  birthDate?: string;

  /** Required by Asaas when cpfCnpj is a CNPJ (14 digits). */
  @IsOptional()
  @IsEnum(['MEI', 'LIMITED', 'INDIVIDUAL', 'ASSOCIATION'] as const)
  companyType?: AsaasCompanyType;
}
