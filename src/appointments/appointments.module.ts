import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { CustomersModule } from '../customers/customers.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { FinanceModule } from '../finance/finance.module';
import { MailModule } from '../mail/mail.module';
import { ProfessionalHoursModule } from '../professional-hours/professional-hours.module';
import { TenantsModule } from '../tenants/tenants.module';
import { AppointmentReminderCron } from './appointment-reminder.cron';
import { DepositHoldExpirationCron } from './deposit-hold-expiration.cron';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [
    AuthModule,
    TenantsModule,
    ProfessionalHoursModule,
    forwardRef(() => BillingModule),
    CustomersModule,
    LoyaltyModule,
    FinanceModule,
    MailModule,
  ],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentReminderCron, DepositHoldExpirationCron],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
