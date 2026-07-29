import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/** Registra uma entrada de estoque (compra), criando um lote novo. */
export class CreateStockEntryDto {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsString()
  supplierId?: string | null;

  @IsOptional()
  @IsString()
  lotNumber?: string | null;

  @IsOptional()
  @IsDateString()
  expiryDate?: string | null;

  @IsNumber()
  @Min(0)
  unitCost!: number;

  @IsInt()
  @Min(1)
  quantity!: number;
}
