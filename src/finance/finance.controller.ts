import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
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
import type { CashFlowSummary } from './entities/cash-flow-entry.entity';
import type { PayoutSummaryResponse } from './entities/employee-payout.entity';
import type { PendingPayoutServicesResponse } from './entities/employee-payout.entity';
import { SettlePayoutsDto } from './dto/settle-payouts.dto';
import { OpenCashRegisterDto } from './dto/open-cash-register.dto';
import { CloseCashRegisterDto } from './dto/close-cash-register.dto';
import { CashRegisterEntryDto } from './dto/cash-register-entry.dto';
import { CreateRecurringExpenseTemplateDto } from './dto/create-recurring-expense-template.dto';
import { FinanceService } from './finance.service';
import { CashRegisterService } from './cash-register.service';
import { RecurringExpensesService } from './recurring-expenses.service';
import type { CashRegisterStatusResponse } from './entities/daily-cash-register.entity';
import type { CloseCashRegisterResponse } from './entities/daily-cash-register.entity';
import type { DailyCashRegister } from './entities/daily-cash-register.entity';
import type { RecurringExpenseTemplate } from './entities/recurring-expense-template.entity';

@Controller('finance')
export class FinanceController {
  constructor(
    private readonly financeService: FinanceService,
    private readonly cashRegisterService: CashRegisterService,
    private readonly recurringExpensesService: RecurringExpensesService,
  ) {}

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

  @Get('cash-flow/summary')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async getCashFlowSummary(
    @CurrentTenantContext() context: TenantAccessContext,
  ): Promise<CashFlowSummary> {
    return this.financeService.getCashFlowSummary(
      context.tenant.id,
      context.tenant.plan_tier,
    );
  }

  @Get('payouts/summary')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async getPayoutsSummary(
    @CurrentTenantContext() context: TenantAccessContext,
  ): Promise<PayoutSummaryResponse> {
    return this.financeService.getPayoutsSummary(
      context.tenant.id,
      context.tenant.plan_tier,
    );
  }

  @Get('cash/status')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async getCashRegisterStatus(
    @CurrentTenantContext() context: TenantAccessContext,
  ): Promise<CashRegisterStatusResponse> {
    return this.cashRegisterService.getCashRegisterStatus(
      context.tenant.id,
      context.tenant.plan_tier,
    );
  }

  @Post('cash/open')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async openCashRegister(
    @CurrentTenantContext() context: TenantAccessContext,
    @Body() dto: OpenCashRegisterDto,
  ): Promise<DailyCashRegister> {
    const openingBalance = Number(dto.openingBalance);

    if (!Number.isFinite(openingBalance)) {
      throw new BadRequestException('Informe um saldo de abertura válido.');
    }

    return this.cashRegisterService.openCashRegister(
      context.tenant.id,
      context.tenant.plan_tier,
      context.tenantUser.user_id,
      openingBalance,
    );
  }

  @Post('cash/close')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async closeCashRegister(
    @CurrentTenantContext() context: TenantAccessContext,
    @Body() dto: CloseCashRegisterDto,
  ): Promise<CloseCashRegisterResponse> {
    const closingBalance = Number(dto.closingBalance);

    if (!Number.isFinite(closingBalance)) {
      throw new BadRequestException('Informe um saldo de fechamento válido.');
    }

    return this.cashRegisterService.closeCashRegister(
      context.tenant.id,
      context.tenant.plan_tier,
      context.tenantUser.user_id,
      closingBalance,
    );
  }

  @Post('cash/entry')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async addCashRegisterEntry(
    @CurrentTenantContext() context: TenantAccessContext,
    @Body() dto: CashRegisterEntryDto,
  ): Promise<{ success: true }> {
    if (dto.type !== 'SUPPLY' && dto.type !== 'BLEEDING') {
      throw new BadRequestException(
        'O tipo deve ser SUPPLY (suprimento) ou BLEEDING (sangria).',
      );
    }

    const amount = Number(dto.amount);

    if (!Number.isFinite(amount)) {
      throw new BadRequestException('Informe um valor válido.');
    }

    await this.cashRegisterService.addCashRegisterEntry(
      context.tenant.id,
      context.tenant.plan_tier,
      dto.type,
      amount,
      dto.description ?? '',
    );

    return { success: true };
  }

  @Get('recurring-templates')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async listRecurringExpenseTemplates(
    @CurrentTenantContext() context: TenantAccessContext,
  ): Promise<RecurringExpenseTemplate[]> {
    return this.recurringExpensesService.listTemplates(
      context.tenant.id,
      context.tenant.plan_tier,
    );
  }

  @Post('recurring-templates')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async createRecurringExpenseTemplate(
    @CurrentTenantContext() context: TenantAccessContext,
    @Body() dto: CreateRecurringExpenseTemplateDto,
  ): Promise<RecurringExpenseTemplate> {
    return this.recurringExpensesService.createTemplate(
      context.tenant.id,
      context.tenant.plan_tier,
      dto,
    );
  }

  @Get('payouts/pending/:professionalId/services')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async getPendingPayoutServices(
    @CurrentTenantContext() context: TenantAccessContext,
    @Param('professionalId') professionalId: string,
  ): Promise<PendingPayoutServicesResponse> {
    if (!professionalId?.trim()) {
      throw new BadRequestException('O identificador do profissional é obrigatório.');
    }

    return this.financeService.getPendingPayoutServicesForProfessional(
      context.tenant.id,
      context.tenant.plan_tier,
      professionalId.trim(),
    );
  }

  @Post('payouts/settle')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async settlePayouts(
    @CurrentTenantContext() context: TenantAccessContext,
    @Body() dto: SettlePayoutsDto,
  ): Promise<{ success: true }> {
    const professionalId = dto.professionalId?.trim();

    if (!professionalId) {
      throw new BadRequestException('O campo professionalId é obrigatório.');
    }

    await this.financeService.settlePayoutsForProfessional(
      context.tenant.id,
      context.tenant.plan_tier,
      professionalId,
    );

    return { success: true };
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
