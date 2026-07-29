import { IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export const STOCK_ADJUSTMENT_TYPES = [
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'EXPIRED_OUT',
] as const;

export type StockAdjustmentType = (typeof STOCK_ADJUSTMENT_TYPES)[number];

/** Ajuste manual de estoque (correção, perda/quebra ou vencimento). Motivo obrigatório. */
export class CreateStockAdjustmentDto {
  @IsString()
  productId!: string;

  @IsIn(STOCK_ADJUSTMENT_TYPES)
  type!: StockAdjustmentType;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsString()
  @MinLength(3)
  reason!: string;

  @IsOptional()
  @IsString()
  lotId?: string | null;
}
