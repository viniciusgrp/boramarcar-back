import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';
import { BusinessHoursController } from './business-hours.controller';
import { BusinessHoursService } from './business-hours.service';

@Module({
  imports: [AuthModule, TenantsModule],
  controllers: [BusinessHoursController],
  providers: [BusinessHoursService],
  exports: [BusinessHoursService],
})
export class BusinessHoursModule {}
