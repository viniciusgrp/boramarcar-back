export type RecurringExpenseFrequency = 'MONTHLY' | 'WEEKLY';

export interface RecurringExpenseTemplate {
  id: string;
  tenant_id: string;
  amount: number;
  description: string;
  category: string;
  due_day: number;
  frequency: RecurringExpenseFrequency;
  created_at: string;
}
