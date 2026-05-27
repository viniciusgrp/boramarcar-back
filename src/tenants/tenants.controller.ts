import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant } from './entities/tenant.entity';
import { TenantsService } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('me')
  @UseGuards(AuthGuard)
  async findMine(@CurrentUser() user: User): Promise<Tenant> {
    const tenant = await this.tenantsService.findByOwnerId(user.id);

    if (!tenant) {
      throw new NotFoundException(
        'No establishment linked to the authenticated user',
      );
    }

    return tenant;
  }

  @Put('me')
  @UseGuards(AuthGuard)
  async updateMine(
    @CurrentUser() user: User,
    @Body() dto: UpdateTenantDto,
  ): Promise<Tenant> {
    return this.tenantsService.updateForOwner(user.id, dto);
  }

  @Get(':slug')
  async findBySlug(@Param('slug') slug: string): Promise<Tenant> {
    const tenant = await this.tenantsService.findBySlug(slug);

    if (!tenant) {
      throw new NotFoundException(
        `Tenant with slug "${slug}" was not found`,
      );
    }

    return tenant;
  }
}
