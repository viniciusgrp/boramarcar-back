import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class ValidateCouponDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @MinLength(1)
  code!: string;

  @IsNumber()
  @Min(0)
  totalPrice!: number;

  @IsOptional()
  @IsString()
  customerPhone?: string;
}
