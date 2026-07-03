import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { ProfessionalsModule } from '../professionals/professionals.module';
import { TenantsModule } from '../tenants/tenants.module';
import { ProfessionalAbsencesController } from './professional-absences.controller';
import { ProfessionalAbsencesService } from './professional-absences.service';

@Module({
  imports: [
    AuthModule,
    TenantsModule,
    ProfessionalsModule,
    forwardRef(() => AppointmentsModule),
  ],
  controllers: [ProfessionalAbsencesController],
  providers: [ProfessionalAbsencesService],
  exports: [ProfessionalAbsencesService],
})
export class ProfessionalAbsencesModule {}
