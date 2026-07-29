import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { PRODUCT_SALE_PAYMENT_METHODS } from '../entities/product-sale.entity';

export class ProductSaleItemInputDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  /** Sobrescreve products.sale_price para esta linha, quando informado. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}

export class CreateProductSaleDto {
  @IsOptional()
  @IsString()
  appointmentId?: string | null;

  @IsOptional()
  @IsString()
  professionalId?: string | null;

  @IsOptional()
  @IsString()
  customerId?: string | null;

  @IsOptional()
  @IsString()
  customerName?: string | null;

  @IsOptional()
  @IsString()
  customerPhone?: string | null;

  @IsOptional()
  @IsIn(PRODUCT_SALE_PAYMENT_METHODS)
  paymentMethod?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductSaleItemInputDto)
  items!: ProductSaleItemInputDto[];
}
