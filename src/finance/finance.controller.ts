import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentTenantContext } from '../tenants/decorators/current-tenant-context.decorator';
import { Roles } from '../tenants/decorators/roles.decorator';
import type { TenantAccessContext } from '../tenants/entities/tenant-access-context.entity';
import { TenantAccessGuard } from '../tenants/guards/tenant-access.guard';
import { RolesGuard } from '../tenants/guards/roles.guard';
import { resolveScopedProfessionalId } from '../tenants/utils/tenant-user-scope.util';
import type { AppointmentStatus } from '../appointments/entities/appointment.entity';
import type { FinanceReportResponse } from './entities/finance-report.entity';
import type { ProfessionalCommissionSummary } from './entities/professional-commission-summary.entity';
import { FinanceService } from './finance.service';

@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('customers')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async listCustomersForFilter(@CurrentTenantContext() context: TenantAccessContext) {
    return this.financeService.listCustomersForFilter(
      context.tenant.id,
      context.tenant.plan_tier,
    );
  }

  @Get('reports')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async getFinanceReports(
    @CurrentTenantContext() context: TenantAccessContext,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('professional_id') professionalId?: string,
    @Query('service_id') serviceId?: string,
    @Query('customer_id') customerId?: string,
    @Query('status') status?: string,
  ): Promise<FinanceReportResponse> {
    return this.financeService.getFinanceReports(
      context.tenant.id,
      context.tenant.plan_tier,
      {
        startDate: startDate?.trim() || undefined,
        endDate: endDate?.trim() || undefined,
        professionalId: professionalId?.trim() || undefined,
        serviceId: serviceId?.trim() || undefined,
        customerId: customerId?.trim() || undefined,
        status: status?.trim() as AppointmentStatus | undefined,
      },
    );
  }

  @Get('commissions')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN', 'PROFESSIONAL')
  async getCommissionReport(
    @CurrentTenantContext() context: TenantAccessContext,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ): Promise<ProfessionalCommissionSummary[]> {
    if (!startDate?.trim() || !endDate?.trim()) {
      throw new BadRequestException(
        'Query parameters "start_date" and "end_date" are required (YYYY-MM-DD).',
      );
    }

    const scopedProfessionalId = resolveScopedProfessionalId(
      context.tenantUser,
    );

    return this.financeService.getCommissionReport(
      context.tenant.id,
      context.tenant.plan_tier,
      startDate.trim(),
      endDate.trim(),
      scopedProfessionalId,
    );
  }
}
