import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SkipTenantAccessCheck } from './decorators/skip-tenant-access-check.decorator';
import { TenantAccessGuard } from './guards/tenant-access.guard';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { RegisterTenantResponseDto } from './dto/register-tenant-response.dto';
import { SlugAvailabilityResponseDto } from './dto/slug-availability.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant } from './entities/tenant.entity';
import { TenantsService } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post('register')
  async register(
    @Body() dto: RegisterTenantDto,
  ): Promise<RegisterTenantResponseDto> {
    const tenant = await this.tenantsService.register(dto);
    return { tenant };
  }

  @Get('slug-available/:slug')
  async checkSlugAvailability(
    @Param('slug') slug: string,
  ): Promise<SlugAvailabilityResponseDto> {
    return this.tenantsService.checkSlugAvailability(slug);
  }

  @Get('me')
  @SkipTenantAccessCheck()
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
  @UseGuards(AuthGuard, TenantAccessGuard)
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
