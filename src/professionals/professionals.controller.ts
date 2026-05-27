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
  @UseGuards(AuthGuard)
  async findManaged(@CurrentUser() user: User): Promise<Professional[]> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.professionalsService.findAllManagedByTenant(tenant.id);
  }

  @Get('managed/:id')
  @UseGuards(AuthGuard)
  async findManagedOne(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<Professional> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.professionalsService.findOneWithServices(id, tenant.id);
  }

  @Post()
  @UseGuards(AuthGuard)
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateProfessionalDto,
  ): Promise<Professional> {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Field "name" is required');
    }

    const tenant = await this.resolveOwnerTenant(user.id);
    return this.professionalsService.createForTenant(tenant.id, dto);
  }

  @Put(':id')
  @UseGuards(AuthGuard)
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateProfessionalDto,
  ): Promise<Professional> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.professionalsService.updateForTenant(tenant.id, id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  async softDelete(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<Professional> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.professionalsService.softDeleteForTenant(tenant.id, id);
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
