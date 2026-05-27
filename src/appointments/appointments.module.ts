import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfessionalHoursModule } from '../professional-hours/professional-hours.module';
import { TenantsModule } from '../tenants/tenants.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [AuthModule, TenantsModule, ProfessionalHoursModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
