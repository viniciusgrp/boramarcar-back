import { Module, forwardRef } from '@nestjs/common';
import { AffiliatesModule } from '../affiliates/affiliates.module';
import { AuthModule } from '../auth/auth.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { TenantsModule } from '../tenants/tenants.module';
import { BillingController } from './billing.controller';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [
    AuthModule,
    TenantsModule,
    AffiliatesModule,
    forwardRef(() => AppointmentsModule),
  ],
  controllers: [BillingController, PaymentsWebhookController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
