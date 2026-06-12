export type CashRegisterMovementType = 'SUPPLY' | 'BLEEDING';

export class CashRegisterEntryDto {
  type!: CashRegisterMovementType;
  amount!: number;
  description!: string;
}
