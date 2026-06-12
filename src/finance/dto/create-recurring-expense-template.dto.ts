import type { RecurringExpenseFrequency } from '../entities/recurring-expense-template.entity';

export class CreateRecurringExpenseTemplateDto {
  amount!: number;
  description!: string;
  category!: string;
  dueDay!: number;
  frequency!: RecurringExpenseFrequency;
}
