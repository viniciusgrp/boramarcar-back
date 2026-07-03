import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Put,
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
import { BusinessHoursService } from './business-hours.service';
import { UpdateBusinessHoursDto } from './dto/update-business-hours.dto';
import { BusinessHour } from './entities/business-hour.entity';

@Controller('business-hours')
export class BusinessHoursController {
  constructor(
    private readonly businessHoursService: BusinessHoursService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Get()
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN', 'PROFESSIONAL')
  async findMine(
    @CurrentTenantContext() context: TenantAccessContext,
  ): Promise<BusinessHour[]> {
    return this.businessHoursService.findAllByTenant(context.tenant.id);
  }

  @Put()
  @UseGuards(AuthGuard, TenantAccessGuard)
  async updateMine(
    @CurrentUser() user: User,
    @Body() dto: UpdateBusinessHoursDto,
  ): Promise<BusinessHour[]> {
    if (!dto.hours?.length) {
      throw new BadRequestException('Field "hours" is required');
    }

    const tenant = await this.resolveOwnerTenant(user.id);
    return this.businessHoursService.replaceForTenant(tenant.id, dto.hours);
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
