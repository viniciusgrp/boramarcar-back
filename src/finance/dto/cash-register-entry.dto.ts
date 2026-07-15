import { IsEnum, IsNumber, IsString, Min, MinLength } from 'class-validator';

export type CashRegisterMovementType = 'SUPPLY' | 'BLEEDING';

export class CashRegisterEntryDto {
  @IsEnum(['SUPPLY', 'BLEEDING'] as const)
  type!: CashRegisterMovementType;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsString()
  @MinLength(1)
  description!: string;
}
