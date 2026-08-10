import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentPlatformAdmin } from './decorators/current-platform-admin.decorator';
import type { PlatformAdmin } from './entities/platform-admin.entity';
import { PlatformAdminGuard } from './guards/platform-admin.guard';
import { PlatformService } from './platform.service';
import type {
  PlatformSummaryResponse,
  PlatformTenantDetail,
  PlatformTenantListResponse,
} from './dto/platform-responses.dto';

@Controller('platform')
@UseGuards(AuthGuard, PlatformAdminGuard)
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get('me')
  async getMe(
    @CurrentPlatformAdmin() platformAdmin: PlatformAdmin,
  ): Promise<{ id: string; name: string; role: string }> {
    return {
      id: platformAdmin.id,
      name: platformAdmin.name,
      role: platformAdmin.role,
    };
  }

  @Get('summary')
  async getSummary(): Promise<PlatformSummaryResponse> {
    return this.platformService.getSummary();
  }

  @Get('tenants')
  async listTenants(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('plan') plan?: string,
  ): Promise<PlatformTenantListResponse> {
    return this.platformService.listTenants({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      search,
      status,
      plan,
    });
  }

  @Get('tenants/:id')
  async getTenantDetail(
    @Param('id') id: string,
  ): Promise<PlatformTenantDetail> {
    return this.platformService.getTenantDetail(id);
  }
}
