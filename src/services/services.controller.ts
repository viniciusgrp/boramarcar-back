import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantAccessGuard } from '../tenants/guards/tenant-access.guard';
import { TenantsService } from '../tenants/tenants.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { Service } from './entities/service.entity';
import { ServicesService } from './services.service';

@Controller('services')
export class ServicesController {
  constructor(
    private readonly servicesService: ServicesService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Get()
  async findAllByTenant(
    @Query('tenantId') tenantId?: string,
  ): Promise<Service[]> {
    if (!tenantId) {
      throw new BadRequestException('Query parameter "tenantId" is required');
    }

    return this.servicesService.findAllByTenant(tenantId);
  }

  @Get('managed')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async findManaged(@CurrentUser() user: User): Promise<Service[]> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.servicesService.findAllManagedByTenant(tenant.id);
  }

  @Post()
  @UseGuards(AuthGuard, TenantAccessGuard)
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateServiceDto,
  ): Promise<Service> {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Field "name" is required');
    }

    if (dto.durationMinutes === undefined || dto.price === undefined) {
      throw new BadRequestException(
        'Fields "durationMinutes" and "price" are required',
      );
    }

    const tenant = await this.resolveOwnerTenant(user.id);
    return this.servicesService.createForTenant(tenant.id, dto);
  }

  @Put(':id')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ): Promise<Service> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.servicesService.updateForTenant(tenant.id, id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async softDelete(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<Service> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.servicesService.softDeleteForTenant(tenant.id, id);
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
