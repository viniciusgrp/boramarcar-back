import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantAccessGuard } from '../tenants/guards/tenant-access.guard';
import { TenantsService } from '../tenants/tenants.service';
import { CreateInternalAppointmentDto } from './dto/create-internal-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { AdminAppointment } from './entities/admin-appointment.entity';
import { CreateAppointmentResponse } from './entities/create-appointment-response.entity';
import { AppointmentsService } from './appointments.service';
import { parseServiceIdsQuery } from './utils/parse-service-ids.util';

@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Get('admin')
  @UseGuards(AuthGuard, TenantAccessGuard)
  findAllByDate(
    @Query('tenantId') tenantId?: string,
    @Query('date') date?: string,
  ): Promise<AdminAppointment[]> {
    if (!tenantId || !date) {
      throw new BadRequestException(
        'Query parameters "tenantId" and "date" are required',
      );
    }

    return this.appointmentsService.findAllByDate(tenantId, date);
  }

  @Get('availability')
  getAvailability(
    @Query('tenantId') tenantId?: string,
    @Query('professionalId') professionalId?: string,
    @Query('serviceId') serviceId?: string,
    @Query('serviceIds') serviceIds?: string,
    @Query('date') date?: string,
  ): Promise<{ slots: string[] }> {
    const resolvedServiceIds = parseServiceIdsQuery(serviceId, serviceIds);

    if (!tenantId || !professionalId || !date || resolvedServiceIds.length === 0) {
      throw new BadRequestException(
        'Query parameters "tenantId", "professionalId", "date" and at least one service id ("serviceIds" or "serviceId") are required',
      );
    }

    return this.appointmentsService
      .getAvailability(tenantId, professionalId, resolvedServiceIds, date)
      .then((slots) => ({ slots }));
  }

  @Post('internal')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async createInternal(
    @CurrentUser() user: User,
    @Body() dto: CreateInternalAppointmentDto,
  ): Promise<AdminAppointment> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.appointmentsService.createInternal(tenant.id, dto);
  }

  @Patch(':id/approve')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async approve(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<AdminAppointment> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.appointmentsService.approveAppointmentForTenant(tenant.id, id);
  }

  @Patch(':id/reject')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async reject(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<AdminAppointment> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.appointmentsService.rejectAppointmentForTenant(tenant.id, id);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async updateStatus(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ): Promise<AdminAppointment> {
    if (!dto.status) {
      throw new BadRequestException('Field "status" is required');
    }

    const tenant = await this.resolveOwnerTenant(user.id);
    return this.appointmentsService.updateStatusForTenant(
      tenant.id,
      id,
      dto.status,
    );
  }

  @Post()
  create(@Body() dto: CreateAppointmentDto): Promise<CreateAppointmentResponse> {
    return this.appointmentsService.create(dto);
  }

  private async resolveOwnerTenant(userId: string) {
    const tenant = await this.tenantsService.findByOwnerId(userId);

    if (!tenant) {
      throw new NotFoundException(
        'No establishment linked to the authenticated user',
      );
    }

    return tenant;
  }
}

