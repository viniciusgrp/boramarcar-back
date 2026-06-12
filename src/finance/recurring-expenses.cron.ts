import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RecurringExpensesService } from './recurring-expenses.service';

@Injectable()
export class RecurringExpensesCron {
  constructor(
    private readonly recurringExpensesService: RecurringExpensesService,
  ) {}

  @Cron('0 6 * * *')
  async handleDailyRecurringExpenses(): Promise<void> {
    await this.recurringExpensesService.processDueRecurringExpenses();
  }
}
