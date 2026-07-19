import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { BusinessHoursModule } from '../business-hours/business-hours.module';
import { CustomersModule } from '../customers/customers.module';
import { CouponsModule } from '../coupons/coupons.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { FinanceModule } from '../finance/finance.module';
import { MailModule } from '../mail/mail.module';
import { ProfessionalHoursModule } from '../professional-hours/professional-hours.module';
import { ProfessionalAbsencesModule } from '../professional-absences/professional-absences.module';
import { ProfessionalsModule } from '../professionals/professionals.module';
import { TenantsModule } from '../tenants/tenants.module';
import { AppointmentReminderCron } from './appointment-reminder.cron';
import { DepositHoldExpirationCron } from './deposit-hold-expiration.cron';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { DepositPaymentService } from './deposit-payment.service';

@Module({
  imports: [
    AuthModule,
    TenantsModule,
    ProfessionalsModule,
    ProfessionalHoursModule,
    BusinessHoursModule,
    forwardRef(() => ProfessionalAbsencesModule),
    forwardRef(() => BillingModule),
    CustomersModule,
    LoyaltyModule,
    CouponsModule,
    FinanceModule,
    MailModule,
  ],
  controllers: [AppointmentsController],
  providers: [
    AppointmentsService,
    DepositPaymentService,
    AppointmentReminderCron,
    DepositHoldExpirationCron,
  ],
  exports: [AppointmentsService, DepositPaymentService],
})
export class AppointmentsModule {}
