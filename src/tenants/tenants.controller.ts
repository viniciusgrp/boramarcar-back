import {
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Put,
  Patch,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { User } from '@supabase/supabase-js';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AllowInactiveTenantAccess } from './decorators/allow-inactive-tenant-access.decorator';
import { SkipTenantAccessCheck } from './decorators/skip-tenant-access-check.decorator';
import { Roles } from './decorators/roles.decorator';
import { TenantAccessGuard } from './guards/tenant-access.guard';
import { RolesGuard } from './guards/roles.guard';
import { OnboardTenantDto } from './dto/onboard-tenant.dto';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { RegisterTenantResponseDto } from './dto/register-tenant-response.dto';
import { SlugAvailabilityResponseDto } from './dto/slug-availability.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UpdateTenantAdminThemeDto } from './dto/update-tenant-admin-theme.dto';
import { TenantMeResponse } from './entities/tenant-me-response.entity';
import { Tenant } from './entities/tenant.entity';
import type { PublicTenant } from './entities/public-tenant.entity';
import type { InitialSetupStatus } from './entities/initial-setup-status.entity';
import type { TenantOpenGraphPayload } from './utils/tenant-open-graph.util';
import { InitialSetupService } from './initial-setup.service';
import { TenantOpenGraphService } from './tenant-open-graph.service';
import { TenantsService } from './tenants.service';
import { toPublicTenant } from './utils/to-public-tenant.util';

@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly initialSetupService: InitialSetupService,
    private readonly tenantOpenGraphService: TenantOpenGraphService,
  ) {}

  @Post('register')
  @Throttle({ medium: { limit: 5, ttl: 60_000 } })
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
  async findMine(@CurrentUser() user: User): Promise<TenantMeResponse> {
    const response = await this.tenantsService.findMeResponse(user.id);

    if (!response) {
      throw new NotFoundException(
        'No establishment linked to the authenticated user',
      );
    }

    return response;
  }

  @Post('me/onboard')
  @SkipTenantAccessCheck()
  @UseGuards(AuthGuard)
  async onboard(
    @CurrentUser() user: User,
    @Body() dto: OnboardTenantDto,
  ): Promise<RegisterTenantResponseDto> {
    const tenant = await this.tenantsService.onboardForAuthenticatedUser(
      user.id,
      dto,
    );
    return { tenant };
  }

  @Get('me/initial-setup')
  @SkipTenantAccessCheck()
  @UseGuards(AuthGuard)
  getInitialSetup(@CurrentUser() user: User): Promise<InitialSetupStatus> {
    return this.initialSetupService.getStatusForUser(user.id);
  }

  @Post('me/initial-setup/settings-visited')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  @AllowInactiveTenantAccess()
  markInitialSetupSettingsVisited(
    @CurrentUser() user: User,
  ): Promise<InitialSetupStatus> {
    return this.initialSetupService.markSettingsVisitedForUser(user.id);
  }

  @Post('me/initial-setup/booking-link-shared')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  @AllowInactiveTenantAccess()
  markInitialSetupBookingLinkShared(
    @CurrentUser() user: User,
  ): Promise<InitialSetupStatus> {
    return this.initialSetupService.markBookingLinkSharedForUser(user.id);
  }

  @Put('me')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async updateMine(
    @CurrentUser() user: User,
    @Body() dto: UpdateTenantDto,
  ): Promise<Tenant> {
    return this.tenantsService.updateForOwner(user.id, dto);
  }

  @Patch('me/admin-theme')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  updateAdminTheme(
    @CurrentUser() user: User,
    @Body() dto: UpdateTenantAdminThemeDto,
  ): Promise<Tenant> {
    return this.tenantsService.updateAdminThemeForOwner(user.id, dto);
  }

  @Get(':slug/open-graph')
  getOpenGraph(@Param('slug') slug: string): Promise<TenantOpenGraphPayload> {
    return this.tenantOpenGraphService.getOpenGraphPayload(slug);
  }

  @Get(':slug/og-image')
  @Header('Content-Type', 'image/png')
  @Header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  async getOgImage(@Param('slug') slug: string): Promise<StreamableFile> {
    const png = await this.tenantOpenGraphService.getOgImagePng(slug);
    return new StreamableFile(png, {
      type: 'image/png',
      disposition: 'inline',
    });
  }

  @Get(':slug')
  async findBySlug(@Param('slug') slug: string): Promise<PublicTenant> {
    const tenant = await this.tenantsService.findBySlug(slug);

    if (!tenant) {
      throw new NotFoundException(
        `Tenant with slug "${slug}" was not found`,
      );
    }

    return toPublicTenant(tenant);
  }
}
