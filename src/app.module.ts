import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './supabase/supabase.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { BillingModule } from './billing/billing.module';
import { FinanceModule } from './finance/finance.module';
import { CustomersModule } from './customers/customers.module';
import { UsersModule } from './users/users.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { CouponsModule } from './coupons/coupons.module';
import { ReviewsModule } from './reviews/reviews.module';
import { BusinessHoursModule } from './business-hours/business-hours.module';
import { ProfessionalHoursModule } from './professional-hours/professional-hours.module';
import { ProfessionalAbsencesModule } from './professional-absences/professional-absences.module';
import { ProfessionalsModule } from './professionals/professionals.module';
import { ServicesModule } from './services/services.module';
import { TenantsModule } from './tenants/tenants.module';
import { UploadModule } from './upload/upload.module';
import { SupportModule } from './support/support.module';
import { InventoryModule } from './inventory/inventory.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(__dirname, '..', '.env'),
        join(process.cwd(), 'backend', '.env'),
        join(process.cwd(), '.env'),
      ],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 20,
      },
      {
        name: 'medium',
        ttl: 60_000,
        limit: 200,
      },
    ]),
    SupabaseModule,
    TenantsModule,
    ServicesModule,
    ProfessionalsModule,
    AppointmentsModule,
    BusinessHoursModule,
    ProfessionalHoursModule,
    ProfessionalAbsencesModule,
    BillingModule,
    FinanceModule,
    CustomersModule,
    UsersModule,
    LoyaltyModule,
    CouponsModule,
    ReviewsModule,
    UploadModule,
    SupportModule,
    InventoryModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
