import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalCurrentUser } from '../auth/decorators/optional-current-user.decorator';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import { resolveAuthUserId } from '../auth/utils/resolve-auth-user-id.util';
import { CurrentTenantContext } from '../tenants/decorators/current-tenant-context.decorator';
import { Roles } from '../tenants/decorators/roles.decorator';
import type { TenantAccessContext } from '../tenants/entities/tenant-access-context.entity';
import { TenantAccessGuard } from '../tenants/guards/tenant-access.guard';
import { RolesGuard } from '../tenants/guards/roles.guard';
import { resolveScopedProfessionalId } from '../tenants/utils/tenant-user-scope.util';
import { CreateInternalAppointmentDto } from './dto/create-internal-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { AdminAppointment } from './entities/admin-appointment.entity';
import {
  CustomerAppointment,
} from './entities/customer-appointment.entity';
import type { CustomerAppointmentGroup } from './entities/customer-appointment-group.entity';
import { CreateAppointmentResponse } from './entities/create-appointment-response.entity';
import { AppointmentsService } from './appointments.service';
import { parseServiceIdsQuery } from './utils/parse-service-ids.util';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get('admin/customer/:customerId')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  findByCustomerForAdmin(
    @CurrentTenantContext() context: TenantAccessContext,
    @Param('customerId') customerId: string,
    @Query('tenantId') tenantId?: string,
    @Query('scope') scope?: 'upcoming' | 'past',
  ): Promise<AdminAppointment[]> {
    if (!tenantId?.trim()) {
      throw new BadRequestException('Query parameter "tenantId" is required');
    }

    if (tenantId !== context.tenant.id) {
      throw new BadRequestException('Tenant informado é inválido.');
    }

    if (scope !== 'upcoming' && scope !== 'past') {
      throw new BadRequestException(
        'Query parameter "scope" must be "upcoming" or "past"',
      );
    }

    return this.appointmentsService.findByCustomerForTenant(
      context.tenant.id,
      customerId.trim(),
      scope,
    );
  }

  @Get('admin/pending-approval')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN', 'PROFESSIONAL')
  findPendingApprovalForAdmin(
    @CurrentTenantContext() context: TenantAccessContext,
    @Query('tenantId') tenantId?: string,
  ): Promise<AdminAppointment[]> {
    if (!tenantId?.trim()) {
      throw new BadRequestException('Query parameter "tenantId" is required');
    }

    if (tenantId !== context.tenant.id) {
      throw new BadRequestException('Tenant informado é inválido.');
    }

    const scopedProfessionalId = resolveScopedProfessionalId(
      context.tenantUser,
    );

    return this.appointmentsService.findPendingApprovalForAdmin(
      context.tenant.id,
      scopedProfessionalId,
    );
  }

  @Get('admin')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN', 'PROFESSIONAL')
  findAllByDate(
    @CurrentTenantContext() context: TenantAccessContext,
    @Query('tenantId') tenantId?: string,
    @Query('date') date?: string,
  ): Promise<AdminAppointment[]> {
    if (!tenantId || !date) {
      throw new BadRequestException(
        'Query parameters "tenantId" and "date" are required',
      );
    }

    if (tenantId !== context.tenant.id) {
      throw new BadRequestException('Tenant informado é inválido.');
    }

    const scopedProfessionalId = resolveScopedProfessionalId(
      context.tenantUser,
    );

    return this.appointmentsService.findAllByDate(
      context.tenant.id,
      date,
      scopedProfessionalId,
    );
  }

  @Get('availability')
  getAvailability(
    @Query('tenantId') tenantId?: string,
    @Query('professionalId') professionalId?: string,
    @Query('anyProfessional') anyProfessional?: string,
    @Query('serviceId') serviceId?: string,
    @Query('serviceIds') serviceIds?: string,
    @Query('date') date?: string,
  ): Promise<{ slots: string[] }> {
    const resolvedServiceIds = parseServiceIdsQuery(serviceId, serviceIds);
    const useAnyProfessional =
      anyProfessional === 'true' || professionalId?.trim() === 'any';

    if (!tenantId || !date || resolvedServiceIds.length === 0) {
      throw new BadRequestException(
        'Query parameters "tenantId", "date" and at least one service id ("serviceIds" or "serviceId") are required',
      );
    }

    if (useAnyProfessional) {
      return this.appointmentsService
        .getAvailabilityForAnyProfessional(
          tenantId,
          resolvedServiceIds,
          date,
        )
        .then((slots) => ({ slots }));
    }

    if (!professionalId?.trim()) {
      throw new BadRequestException(
        'Query parameter "professionalId" is required unless "anyProfessional" is true',
      );
    }

    return this.appointmentsService
      .getAvailability(tenantId, professionalId, resolvedServiceIds, date)
      .then((slots) => ({ slots }));
  }

  @Get('available-days')
  getAvailableDays(
    @Query('tenantId') tenantId?: string,
    @Query('professionalId') professionalId?: string,
    @Query('anyProfessional') anyProfessional?: string,
    @Query('serviceId') serviceId?: string,
    @Query('serviceIds') serviceIds?: string,
  ): Promise<{ days: string[] }> {
    const resolvedServiceIds = parseServiceIdsQuery(serviceId, serviceIds);
    const useAnyProfessional =
      anyProfessional === 'true' || professionalId?.trim() === 'any';

    if (!tenantId || resolvedServiceIds.length === 0) {
      throw new BadRequestException(
        'Query parameters "tenantId" and at least one service id ("serviceIds" or "serviceId") are required',
      );
    }

    if (!useAnyProfessional && !professionalId?.trim()) {
      throw new BadRequestException(
        'Query parameter "professionalId" is required unless "anyProfessional" is true',
      );
    }

    return this.appointmentsService
      .getAvailableDays(tenantId, resolvedServiceIds, {
        anyProfessional: useAnyProfessional,
        professionalId: useAnyProfessional ? undefined : professionalId?.trim(),
      })
      .then((days) => ({ days }));
  }

  @Get('my/all')
  @UseGuards(AuthGuard)
  findMineAll(
    @CurrentUser() user: User,
    @Query('scope') scope?: 'upcoming' | 'past',
  ): Promise<CustomerAppointmentGroup[]> {
    if (scope !== 'upcoming' && scope !== 'past') {
      throw new BadRequestException(
        'Query parameter "scope" must be "upcoming" or "past"',
      );
    }

    return this.appointmentsService.findAllForCustomer(
      resolveAuthUserId(user),
      scope,
    );
  }

  @Get('my')
  @UseGuards(AuthGuard)
  findMine(
    @CurrentUser() user: User,
    @Query('tenantId') tenantId?: string,
    @Query('scope') scope?: 'upcoming' | 'past',
  ): Promise<CustomerAppointment[]> {
    if (!tenantId?.trim()) {
      throw new BadRequestException('Query parameter "tenantId" is required');
    }

    if (scope !== 'upcoming' && scope !== 'past') {
      throw new BadRequestException(
        'Query parameter "scope" must be "upcoming" or "past"',
      );
    }

    return this.appointmentsService.findForCustomer(
      resolveAuthUserId(user),
      tenantId.trim(),
      scope,
    );
  }

  @Patch(':id/request-cancellation')
  @UseGuards(AuthGuard)
  requestCancellation(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('tenantId') tenantId?: string,
  ): Promise<CustomerAppointment> {
    if (!tenantId?.trim()) {
      throw new BadRequestException('Query parameter "tenantId" is required');
    }

    return this.appointmentsService.requestCancellationForCustomer(
      resolveAuthUserId(user),
      tenantId.trim(),
      id,
    );
  }

  @Post('internal')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN', 'PROFESSIONAL')
  createInternal(
    @CurrentTenantContext() context: TenantAccessContext,
    @Body() dto: CreateInternalAppointmentDto,
  ): Promise<AdminAppointment> {
    const scopedProfessionalId = resolveScopedProfessionalId(
      context.tenantUser,
    );

    return this.appointmentsService.createInternal(
      context.tenant.id,
      dto,
      scopedProfessionalId,
    );
  }

  @Patch(':id/approve')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN', 'PROFESSIONAL')
  approve(
    @CurrentTenantContext() context: TenantAccessContext,
    @Param('id') id: string,
  ): Promise<AdminAppointment> {
    const scopedProfessionalId = resolveScopedProfessionalId(
      context.tenantUser,
    );

    return this.appointmentsService.approveAppointmentForTenant(
      context.tenant.id,
      id,
      scopedProfessionalId,
    );
  }

  @Patch(':id/reject')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN', 'PROFESSIONAL')
  reject(
    @CurrentTenantContext() context: TenantAccessContext,
    @Param('id') id: string,
  ): Promise<AdminAppointment> {
    const scopedProfessionalId = resolveScopedProfessionalId(
      context.tenantUser,
    );

    return this.appointmentsService.rejectAppointmentForTenant(
      context.tenant.id,
      id,
      scopedProfessionalId,
    );
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN', 'PROFESSIONAL')
  updateStatus(
    @CurrentTenantContext() context: TenantAccessContext,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ): Promise<AdminAppointment> {
    if (!dto.status) {
      throw new BadRequestException('Field "status" is required');
    }

    const scopedProfessionalId = resolveScopedProfessionalId(
      context.tenantUser,
    );

    return this.appointmentsService.updateStatusForTenant(
      context.tenant.id,
      id,
      dto.status,
      scopedProfessionalId,
    );
  }

  @Post()
  @UseGuards(OptionalAuthGuard)
  create(
    @Body() dto: CreateAppointmentDto,
    @OptionalCurrentUser() user?: User,
  ): Promise<CreateAppointmentResponse> {
    return this.appointmentsService.create(
      dto,
      user ? resolveAuthUserId(user) : undefined,
    );
  }
}

