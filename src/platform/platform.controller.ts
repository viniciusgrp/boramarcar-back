import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AffiliatesService } from '../affiliates/affiliates.service';
import {
  MarkAffiliatePayoutPaidDto,
  UpdateAffiliateStatusDto,
} from '../affiliates/dto/affiliate.dto';
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
  constructor(
    private readonly platformService: PlatformService,
    private readonly affiliatesService: AffiliatesService,
  ) {}

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

  @Get('affiliates')
  listAffiliates(
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.affiliatesService.listForPlatform({ status, search });
  }

  @Get('affiliates/:id')
  getAffiliateDetail(@Param('id') id: string) {
    return this.affiliatesService.getPlatformDetail(id);
  }

  @Patch('affiliates/:id')
  updateAffiliateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAffiliateStatusDto,
  ) {
    return this.affiliatesService.updateStatus(id, dto.status, dto.notes);
  }

  @Get('affiliate-payouts')
  listAffiliatePayouts() {
    return this.affiliatesService.listPayoutsForPlatform();
  }

  @Post('affiliate-payouts/generate')
  generateAffiliatePayouts(
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const now = new Date();
    const periodYear = year ? Number(year) : now.getUTCFullYear();
    const periodMonth = month ? Number(month) : now.getUTCMonth() + 1;
    return this.affiliatesService.generateMonthlyPayouts(periodYear, periodMonth);
  }

  @Post('affiliate-payouts/:id/paid')
  markAffiliatePayoutPaid(
    @Param('id') id: string,
    @Body() dto: MarkAffiliatePayoutPaidDto,
    @CurrentPlatformAdmin() platformAdmin: PlatformAdmin,
  ) {
    return this.affiliatesService.markPayoutPaid(
      id,
      platformAdmin.id,
      dto.external_ref,
    );
  }
}
