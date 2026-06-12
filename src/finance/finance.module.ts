import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';
import { CashRegisterService } from './cash-register.service';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { RecurringExpensesCron } from './recurring-expenses.cron';
import { RecurringExpensesService } from './recurring-expenses.service';

@Module({
  imports: [AuthModule, TenantsModule],
  controllers: [FinanceController],
  providers: [
    FinanceService,
    CashRegisterService,
    RecurringExpensesService,
    RecurringExpensesCron,
  ],
  exports: [FinanceService],
})
export class FinanceModule {}
