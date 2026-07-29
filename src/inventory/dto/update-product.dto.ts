import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { PRODUCT_UNITS } from '../entities/product.entity';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  sku?: string | null;

  @IsOptional()
  @IsString()
  barcode?: string | null;

  @IsOptional()
  @IsIn(PRODUCT_UNITS)
  unit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salePrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStockAlert?: number;

  @IsOptional()
  @IsBoolean()
  trackLots?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  customCommissionRate?: number | null;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
