import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentTenantContext } from '../tenants/decorators/current-tenant-context.decorator';
import { Roles } from '../tenants/decorators/roles.decorator';
import type { TenantAccessContext } from '../tenants/entities/tenant-access-context.entity';
import { TenantAccessGuard } from '../tenants/guards/tenant-access.guard';
import { RolesGuard } from '../tenants/guards/roles.guard';
import { TenantsService } from '../tenants/tenants.service';
import { resolveScopedProfessionalId } from '../tenants/utils/tenant-user-scope.util';
import { ProfessionalsService } from '../professionals/professionals.service';
import { ProfessionalDayStatusDto } from './dto/professional-day-status.dto';
import { UpdateProfessionalHoursDto } from './dto/update-professional-hours.dto';
import { ProfessionalHour } from './entities/professional-hour.entity';
import { ProfessionalHoursService } from './professional-hours.service';

@Controller('professional-hours')
export class ProfessionalHoursController {
  constructor(
    private readonly professionalHoursService: ProfessionalHoursService,
    private readonly professionalsService: ProfessionalsService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Get('day-status')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN', 'PROFESSIONAL')
  async getDayStatus(
    @CurrentTenantContext() context: TenantAccessContext,
    @Query('date') date?: string,
  ): Promise<ProfessionalDayStatusDto[]> {
    if (!date?.trim()) {
      throw new BadRequestException('Query parameter "date" is required');
    }

    const professionals = await this.professionalsService.findAllManagedByTenant(
      context.tenant.id,
    );
    const scopedProfessionalId = resolveScopedProfessionalId(
      context.tenantUser,
    );
    let activeIds = professionals
      .filter((item) => item.is_active)
      .map((item) => item.id);

    if (scopedProfessionalId) {
      activeIds = activeIds.filter((id) => id === scopedProfessionalId);
    }

    return this.professionalHoursService.getDayStatusForTenant(
      context.tenant.id,
      date.trim(),
      activeIds,
    );
  }

  @Get(':professionalId')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async findByProfessional(
    @CurrentUser() user: User,
    @Param('professionalId') professionalId: string,
  ): Promise<ProfessionalHour[]> {
    const tenant = await this.resolveOwnerTenant(user.id);
    await this.assertProfessionalBelongsToTenant(professionalId, tenant.id);

    return this.professionalHoursService.findAllByProfessional(
      tenant.id,
      professionalId,
    );
  }

  @Put(':professionalId')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async updateForProfessional(
    @CurrentUser() user: User,
    @Param('professionalId') professionalId: string,
    @Body() dto: UpdateProfessionalHoursDto,
  ): Promise<ProfessionalHour[]> {
    if (!dto.hours?.length) {
      throw new BadRequestException('Field "hours" is required');
    }

    const tenant = await this.resolveOwnerTenant(user.id);
    await this.assertProfessionalBelongsToTenant(professionalId, tenant.id);

    return this.professionalHoursService.replaceForProfessional(
      tenant.id,
      professionalId,
      dto.hours,
    );
  }

  private async assertProfessionalBelongsToTenant(
    professionalId: string,
    tenantId: string,
  ): Promise<void> {
    await this.professionalsService.assertProfessionalBelongsToTenant(
      professionalId,
      tenantId,
    );
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
