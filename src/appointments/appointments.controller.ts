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
import { TenantsService } from '../tenants/tenants.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { AdminAppointment } from './entities/admin-appointment.entity';
import { Appointment } from './entities/appointment.entity';
import { AppointmentsService } from './appointments.service';

@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Get('admin')
  @UseGuards(AuthGuard)
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
    @Query('date') date?: string,
  ): Promise<{ slots: string[] }> {
    if (!tenantId || !professionalId || !serviceId || !date) {
      throw new BadRequestException(
        'Query parameters "tenantId", "professionalId", "serviceId" and "date" are required',
      );
    }

    return this.appointmentsService
      .getAvailability(tenantId, professionalId, serviceId, date)
      .then((slots) => ({ slots }));
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard)
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
  create(@Body() dto: CreateAppointmentDto): Promise<Appointment> {
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
