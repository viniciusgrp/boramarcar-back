import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BusinessHoursModule } from '../business-hours/business-hours.module';
import { ProfessionalAbsencesModule } from '../professional-absences/professional-absences.module';
import { ProfessionalsModule } from '../professionals/professionals.module';
import { TenantsModule } from '../tenants/tenants.module';
import { ProfessionalHoursController } from './professional-hours.controller';
import { ProfessionalHoursService } from './professional-hours.service';

@Module({
  imports: [
    AuthModule,
    TenantsModule,
    BusinessHoursModule,
    ProfessionalAbsencesModule,
    ProfessionalsModule,
  ],
  controllers: [ProfessionalHoursController],
  providers: [ProfessionalHoursService],
  exports: [ProfessionalHoursService],
})
export class ProfessionalHoursModule {}
