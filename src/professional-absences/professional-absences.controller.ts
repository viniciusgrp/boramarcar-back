import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AppointmentsService } from '../appointments/appointments.service';
import type { AdminAppointment } from '../appointments/entities/admin-appointment.entity';
import { CurrentTenantContext } from '../tenants/decorators/current-tenant-context.decorator';
import { Roles } from '../tenants/decorators/roles.decorator';
import type { TenantAccessContext } from '../tenants/entities/tenant-access-context.entity';
import { TenantAccessGuard } from '../tenants/guards/tenant-access.guard';
import { RolesGuard } from '../tenants/guards/roles.guard';
import {
  assertProfessionalSelfScope,
  resolveScopedProfessionalId,
} from '../tenants/utils/tenant-user-scope.util';
import { ProfessionalsService } from '../professionals/professionals.service';
import { CreateProfessionalAbsenceDto } from './dto/create-professional-absence.dto';
import { ProfessionalAbsenceRangeDto } from './dto/professional-absence-range.dto';
import type { ProfessionalAbsence } from './entities/professional-absence.entity';
import { ProfessionalAbsencesService } from './professional-absences.service';

interface ProfessionalAbsenceConflictsResponse {
  appointments: AdminAppointment[];
}

@Controller('professional-absences')
export class ProfessionalAbsencesController {
  constructor(
    private readonly professionalAbsencesService: ProfessionalAbsencesService,
    private readonly appointmentsService: AppointmentsService,
    private readonly professionalsService: ProfessionalsService,
  ) {}

  @Get(':professionalId')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN', 'PROFESSIONAL')
  async findAll(
    @CurrentTenantContext() context: TenantAccessContext,
    @Param('professionalId') professionalId: string,
  ): Promise<ProfessionalAbsence[]> {
    await this.assertAccess(context, professionalId);

    return this.professionalAbsencesService.findAllByProfessional(
      context.tenant.id,
      professionalId,
    );
  }

  @Post(':professionalId/conflicts')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN', 'PROFESSIONAL')
  async findConflicts(
    @CurrentTenantContext() context: TenantAccessContext,
    @Param('professionalId') professionalId: string,
    @Body() dto: ProfessionalAbsenceRangeDto,
  ): Promise<ProfessionalAbsenceConflictsResponse> {
    await this.assertAccess(context, professionalId);

    const scopedProfessionalId = resolveScopedProfessionalId(
      context.tenantUser,
    );

    const appointments =
      await this.appointmentsService.findConflictingAppointmentsForAbsenceRange(
        context.tenant.id,
        professionalId,
        dto,
        scopedProfessionalId,
      );

    return { appointments };
  }

  @Post(':professionalId')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN', 'PROFESSIONAL')
  async create(
    @CurrentTenantContext() context: TenantAccessContext,
    @Param('professionalId') professionalId: string,
    @Body() dto: CreateProfessionalAbsenceDto,
  ): Promise<ProfessionalAbsence> {
    await this.assertAccess(context, professionalId);

    const scopedProfessionalId = resolveScopedProfessionalId(
      context.tenantUser,
    );

    const conflictingAppointments =
      await this.appointmentsService.findConflictingAppointmentsForAbsenceRange(
        context.tenant.id,
        professionalId,
        dto,
        scopedProfessionalId,
      );

    if (conflictingAppointments.length > 0 && !dto.cancelConflicting) {
      throw new BadRequestException(
        'Existem agendamentos no período informado. Confirme o cancelamento para registrar a ausência.',
      );
    }

    const absence = await this.professionalAbsencesService.createForProfessional(
      context.tenant.id,
      professionalId,
      dto,
    );

    if (dto.cancelConflicting && conflictingAppointments.length > 0) {
      for (const appointment of conflictingAppointments) {
        await this.appointmentsService.updateStatusForTenant(
          context.tenant.id,
          appointment.id,
          'CANCELLED',
          scopedProfessionalId,
        );
      }
    }

    return absence;
  }

  @Delete(':id')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN', 'PROFESSIONAL')
  async remove(
    @CurrentTenantContext() context: TenantAccessContext,
    @Param('id') absenceId: string,
  ): Promise<{ success: true }> {
    const absence = await this.professionalAbsencesService.findAbsenceById(
      context.tenant.id,
      absenceId,
    );

    if (!absence) {
      throw new BadRequestException('Ausência não encontrada.');
    }

    const scopedProfessionalId = resolveScopedProfessionalId(
      context.tenantUser,
    );
    assertProfessionalSelfScope(scopedProfessionalId, absence.professionalId);

    await this.professionalAbsencesService.deleteForTenant(
      context.tenant.id,
      absenceId,
    );

    return { success: true };
  }

  private async assertAccess(
    context: TenantAccessContext,
    professionalId: string,
  ): Promise<void> {
    const scopedProfessionalId = resolveScopedProfessionalId(
      context.tenantUser,
    );
    assertProfessionalSelfScope(scopedProfessionalId, professionalId);
    await this.professionalsService.assertProfessionalBelongsToTenant(
      professionalId,
      context.tenant.id,
    );
  }
}
