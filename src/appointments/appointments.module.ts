import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BusinessHoursModule } from '../business-hours/business-hours.module';
import { TenantsModule } from '../tenants/tenants.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [AuthModule, TenantsModule, BusinessHoursModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
