import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
} from 'class-validator';
import type { CouponDiscountType } from '../entities/coupon.entity';

export class CreateCouponDto {
  @IsString()
  @MinLength(1)
  @Matches(/^[A-Za-z0-9-_]+$/, {
    message: 'O código do cupom deve conter apenas letras, números, hífen ou underline.',
  })
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['PERCENTAGE', 'FIXED_AMOUNT'])
  discountType!: CouponDiscountType;

  @IsNumber()
  @Min(0.01)
  discountValue!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsesPerCustomer?: number | null;

  @IsOptional()
  @IsBoolean()
  firstVisitOnly?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minPurchaseAmount?: number | null;

  @IsOptional()
  @IsISO8601()
  validFrom?: string | null;

  @IsOptional()
  @IsISO8601()
  validUntil?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
