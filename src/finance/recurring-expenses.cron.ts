import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { APP_TIME_ZONE } from '../common/app-time-zone';
import { RecurringExpensesService } from './recurring-expenses.service';

@Injectable()
export class RecurringExpensesCron {
  constructor(
    private readonly recurringExpensesService: RecurringExpensesService,
  ) {}

  @Cron('0 6 * * *', { timeZone: APP_TIME_ZONE })
  async handleDailyRecurringExpenses(): Promise<void> {
    await this.recurringExpensesService.processDueRecurringExpenses();
  }
}
