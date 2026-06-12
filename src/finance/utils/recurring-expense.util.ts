import type { RecurringExpenseFrequency } from '../entities/recurring-expense-template.entity';

export function normalizeRecurringExpenseFrequency(
  value: RecurringExpenseFrequency | string | null | undefined,
): RecurringExpenseFrequency {
  if (value === 'WEEKLY') {
    return 'WEEKLY';
  }

  return 'MONTHLY';
}

export function isRecurringExpenseDueToday(
  frequency: RecurringExpenseFrequency,
  dueDay: number,
  referenceDate: Date = new Date(),
): boolean {
  if (frequency === 'MONTHLY') {
    const lastDayOfMonth = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth() + 1,
      0,
    ).getDate();
    const effectiveDueDay = Math.min(dueDay, lastDayOfMonth);

    return referenceDate.getDate() === effectiveDueDay;
  }

  const isoWeekday =
    referenceDate.getDay() === 0 ? 7 : referenceDate.getDay();

  return isoWeekday === dueDay;
}

export function resolveRecurringDueDayLimit(
  frequency: RecurringExpenseFrequency,
): number {
  if (frequency === 'WEEKLY') {
    return 7;
  }

  return 31;
}

export function validateRecurringDueDay(
  frequency: RecurringExpenseFrequency,
  dueDay: number,
): boolean {
  if (!Number.isInteger(dueDay)) {
    return false;
  }

  if (frequency === 'WEEKLY') {
    return dueDay >= 1 && dueDay <= 7;
  }

  return dueDay >= 1 && dueDay <= 31;
}
