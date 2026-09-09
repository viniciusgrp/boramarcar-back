import {
  isRecurringExpenseDueToday,
  normalizeRecurringExpenseFrequency,
  validateRecurringDueDay,
} from './recurring-expense.util';

describe('recurring-expense.util', () => {
  it('defaults unknown frequencies to monthly', () => {
    expect(normalizeRecurringExpenseFrequency('WEEKLY')).toBe('WEEKLY');
    expect(normalizeRecurringExpenseFrequency('nope')).toBe('MONTHLY');
  });

  it('validates due days per frequency', () => {
    expect(validateRecurringDueDay('WEEKLY', 7)).toBe(true);
    expect(validateRecurringDueDay('WEEKLY', 8)).toBe(false);
    expect(validateRecurringDueDay('MONTHLY', 31)).toBe(true);
  });

  it('detects monthly due dates including month-end overflow', () => {
    expect(
      isRecurringExpenseDueToday('MONTHLY', 31, new Date(2026, 1, 28)),
    ).toBe(true);
  });
});
