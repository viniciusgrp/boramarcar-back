import { IsEnum, IsInt, IsNumber, IsString, Max, Min, MinLength } from 'class-validator';
import type { RecurringExpenseFrequency } from '../entities/recurring-expense-template.entity';

export class CreateRecurringExpenseTemplateDto {
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsString()
  @MinLength(1)
  category!: string;

  @IsInt()
  @Min(1)
  @Max(31)
  dueDay!: number;

  @IsEnum(['MONTHLY', 'WEEKLY'] as const)
  frequency!: RecurringExpenseFrequency;
}
