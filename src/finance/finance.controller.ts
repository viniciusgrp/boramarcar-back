import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantAccessGuard } from '../tenants/guards/tenant-access.guard';
import { TenantsService } from '../tenants/tenants.service';
import type { AppointmentStatus } from '../appointments/entities/appointment.entity';
import type { FinanceReportResponse } from './entities/finance-report.entity';
import type { ProfessionalCommissionSummary } from './entities/professional-commission-summary.entity';
import { FinanceService } from './finance.service';

@Controller('finance')
export class FinanceController {
  constructor(
    private readonly financeService: FinanceService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Get('customers')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async listCustomersForFilter(@CurrentUser() user: User) {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.financeService.listCustomersForFilter(
      tenant.id,
      tenant.plan_tier,
    );
  }

  @Get('reports')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async getFinanceReports(
    @CurrentUser() user: User,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('professional_id') professionalId?: string,
    @Query('service_id') serviceId?: string,
    @Query('customer_id') customerId?: string,
    @Query('status') status?: string,
  ): Promise<FinanceReportResponse> {
    const tenant = await this.resolveOwnerTenant(user.id);

    return this.financeService.getFinanceReports(tenant.id, tenant.plan_tier, {
      startDate: startDate?.trim() || undefined,
      endDate: endDate?.trim() || undefined,
      professionalId: professionalId?.trim() || undefined,
      serviceId: serviceId?.trim() || undefined,
      customerId: customerId?.trim() || undefined,
      status: status?.trim() as AppointmentStatus | undefined,
    });
  }

  @Get('commissions')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async getCommissionReport(
    @CurrentUser() user: User,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ): Promise<ProfessionalCommissionSummary[]> {
    if (!startDate?.trim() || !endDate?.trim()) {
      throw new BadRequestException(
        'Query parameters "start_date" and "end_date" are required (YYYY-MM-DD).',
      );
    }

    const tenant = await this.resolveOwnerTenant(user.id);

    return this.financeService.getCommissionReport(
      tenant.id,
      tenant.plan_tier,
      startDate.trim(),
      endDate.trim(),
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
