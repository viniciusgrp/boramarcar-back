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
import { CreateProfessionalDto } from './dto/create-professional.dto';
import { UpdateProfessionalDto } from './dto/update-professional.dto';
import { Professional } from './entities/professional.entity';
import { ProfessionalsService } from './professionals.service';

@Controller('professionals')
export class ProfessionalsController {
  constructor(
    private readonly professionalsService: ProfessionalsService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Get()
  async findAllByTenant(
    @Query('tenantId') tenantId?: string,
  ): Promise<Professional[]> {
    if (!tenantId) {
      throw new BadRequestException('Query parameter "tenantId" is required');
    }

    return this.professionalsService.findAllByTenant(tenantId);
  }

  @Get('managed')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async findManaged(@CurrentUser() user: User): Promise<Professional[]> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.professionalsService.findAllManagedByTenant(tenant.id);
  }

  @Get('managed/:id')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async findManagedOne(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<Professional> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.professionalsService.findOneWithServices(id, tenant.id);
  }

  @Post()
  @UseGuards(AuthGuard, TenantAccessGuard)
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateProfessionalDto,
  ): Promise<Professional> {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Field "name" is required');
    }

    const tenant = await this.resolveOwnerTenant(user.id);
    return this.professionalsService.createForTenant(tenant.id, tenant.plan_tier, dto);
  }

  @Put(':id')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateProfessionalDto,
  ): Promise<Professional> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.professionalsService.updateForTenant(
      tenant.id,
      tenant.plan_tier,
      id,
      dto,
    );
  }

  @Delete(':id')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async softDelete(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<Professional> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.professionalsService.softDeleteForTenant(
      tenant.id,
      tenant.plan_tier,
      id,
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
