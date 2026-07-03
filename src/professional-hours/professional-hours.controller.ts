import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
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
import { ProfessionalDayStatusDto } from './dto/professional-day-status.dto';
import { UpdateProfessionalHoursDto } from './dto/update-professional-hours.dto';
import { ProfessionalHour } from './entities/professional-hour.entity';
import { ProfessionalHoursService } from './professional-hours.service';

@Controller('professional-hours')
export class ProfessionalHoursController {
  constructor(
    private readonly professionalHoursService: ProfessionalHoursService,
    private readonly professionalsService: ProfessionalsService,
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
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN', 'PROFESSIONAL')
  async findByProfessional(
    @CurrentTenantContext() context: TenantAccessContext,
    @Param('professionalId') professionalId: string,
  ): Promise<ProfessionalHour[]> {
    const scopedProfessionalId = resolveScopedProfessionalId(
      context.tenantUser,
    );
    assertProfessionalSelfScope(scopedProfessionalId, professionalId);
    await this.assertProfessionalBelongsToTenant(
      professionalId,
      context.tenant.id,
    );

    return this.professionalHoursService.findAllByProfessional(
      context.tenant.id,
      professionalId,
    );
  }

  @Put(':professionalId')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN', 'PROFESSIONAL')
  async updateForProfessional(
    @CurrentTenantContext() context: TenantAccessContext,
    @Param('professionalId') professionalId: string,
    @Body() dto: UpdateProfessionalHoursDto,
  ): Promise<ProfessionalHour[]> {
    if (!Array.isArray(dto.hours)) {
      throw new BadRequestException('Field "hours" must be an array.');
    }

    const scopedProfessionalId = resolveScopedProfessionalId(
      context.tenantUser,
    );
    assertProfessionalSelfScope(scopedProfessionalId, professionalId);
    await this.assertProfessionalBelongsToTenant(
      professionalId,
      context.tenant.id,
    );

    return this.professionalHoursService.replaceForProfessional(
      context.tenant.id,
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
}
