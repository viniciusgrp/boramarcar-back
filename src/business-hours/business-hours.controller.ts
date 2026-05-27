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
  @UseGuards(AuthGuard)
  async findMine(@CurrentUser() user: User): Promise<BusinessHour[]> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.businessHoursService.findAllByTenant(tenant.id);
  }

  @Put()
  @UseGuards(AuthGuard)
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
