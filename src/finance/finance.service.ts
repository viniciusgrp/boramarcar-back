import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { endOfDay, isAfter, parseISO, startOfDay } from 'date-fns';
import { SupabaseService } from '../supabase/supabase.service';
import type { PlanTier } from '../tenants/entities/plan-tier.type';
import { canConfigureCommissions } from '../professionals/utils/professional-commission.util';
import type {
  FinanceReportFilters,
  FinanceReportResponse,
} from './entities/finance-report.entity';
import type { ProfessionalCommissionSummary } from './entities/professional-commission-summary.entity';
import type { CashFlowSummary } from './entities/cash-flow-entry.entity';
import type { PayoutSummaryResponse } from './entities/employee-payout.entity';
import { normalizePayoutFrequency } from '../tenants/entities/payout-frequency.type';
import {
  buildFinanceReportSummary,
  isValidFinanceReportStatus,
  mapFinanceReportAppointmentRow,
} from './utils/finance-report-mapper.util';
import { buildAppointmentCommissionServiceLines } from '../appointments/utils/appointment-commission.util';
import { calculateAppointmentCommissionAmount } from '../services/utils/service-commission.util';
import { CashRegisterService } from './cash-register.service';

interface CompletedAppointmentRow {
  professional_id: string;
  total_price: number | null;
  commission_amount: number | null;
  professionals:
    | { name: string }
    | { name: string }[]
    | null;
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly cashRegisterService: CashRegisterService,
  ) {}

  assertFinanceAccess(planTier: PlanTier): void {
    if (!canConfigureCommissions(planTier)) {
      throw new ForbiddenException(
        'Relatório financeiro disponível a partir do plano Pro.',
      );
    }
  }

  async getFinanceReports(
    tenantId: string,
    planTier: PlanTier,
    filters: FinanceReportFilters,
  ): Promise<FinanceReportResponse> {
    this.assertFinanceAccess(planTier);

    if (filters.status && !isValidFinanceReportStatus(filters.status)) {
      throw new BadRequestException('Invalid appointment status filter');
    }

    const appointmentIds = filters.serviceId
      ? await this.resolveAppointmentIdsForService(tenantId, filters.serviceId)
      : null;

    if (appointmentIds && appointmentIds.length === 0) {
      return {
        summary: buildFinanceReportSummary([]),
        appointments: [],
      };
    }

    let query = this.supabaseService
      .getClient()
      .from('appointments')
      .select(
        `
        id,
        professional_id,
        service_id,
        customer_id,
        customer_name,
        customer_phone,
        start_time,
        end_time,
        status,
        total_price,
        commission_amount,
        booking_source,
        professionals ( name, commission_percent ),
        services!service_id ( name, price, custom_commission_rate ),
        appointment_services (
          service_id,
          sort_order,
          duration_minutes,
          price,
          services!service_id ( name, custom_commission_rate )
        )
      `,
      )
      .eq('tenant_id', tenantId)
      .order('start_time', { ascending: false });

    if (filters.startDate && filters.endDate) {
      const range = this.resolveDateRange(filters.startDate, filters.endDate);
      query = query
        .gte('start_time', range.startIso)
        .lte('start_time', range.endIso);
    } else if (filters.startDate || filters.endDate) {
      throw new BadRequestException(
        'Informe start_date e end_date juntos para filtrar por período.',
      );
    }

    if (filters.professionalId) {
      query = query.eq('professional_id', filters.professionalId);
    }

    if (filters.customerId) {
      query = query.eq('customer_id', filters.customerId);
    }

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (appointmentIds) {
      query = query.in('id', appointmentIds);
    }

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const appointments = (data ?? []).map((row) =>
      this.mapFinanceReportAppointmentWithCommission(
        row as Parameters<typeof mapFinanceReportAppointmentRow>[0],
      ),
    );

    return {
      summary: buildFinanceReportSummary(appointments),
      appointments,
    };
  }

  async listCustomersForFilter(
    tenantId: string,
    planTier: PlanTier,
  ): Promise<Array<{ id: string; name: string; phone: string }>> {
    this.assertFinanceAccess(planTier);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('customers')
      .select('id, name, phone')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((row) => ({
      id: row.id as string,
      name: (row.name as string)?.trim() || 'Cliente',
      phone: (row.phone as string)?.trim() || '',
    }));
  }

  async getCashFlowSummary(
    tenantId: string,
    planTier: PlanTier,
  ): Promise<CashFlowSummary> {
    this.assertFinanceAccess(planTier);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('cash_flow_entries')
      .select('type, amount')
      .eq('tenant_id', tenantId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    let totalRevenue = 0;
    let totalExpenses = 0;

    for (const row of data ?? []) {
      const amount = Number(row.amount ?? 0);

      if (row.type === 'REVENUE') {
        totalRevenue += amount;
        continue;
      }

      if (row.type === 'EXPENSE') {
        totalExpenses += amount;
      }
    }

    totalRevenue = this.roundCurrency(totalRevenue);
    totalExpenses = this.roundCurrency(totalExpenses);

    return {
      totalRevenue,
      totalExpenses,
      netProfit: this.roundCurrency(totalRevenue - totalExpenses),
    };
  }

  async getPayoutsSummary(
    tenantId: string,
    planTier: PlanTier,
  ): Promise<PayoutSummaryResponse> {
    this.assertFinanceAccess(planTier);

    const tenant = await this.loadTenantFinanceSettings(tenantId);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('employee_payouts')
      .select('professional_id, amount, professionals(name)')
      .eq('tenant_id', tenantId)
      .eq('status', 'PENDING');

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const grouped = new Map<
      string,
      { professionalName: string; pendingAmount: number; pendingCount: number }
    >();

    for (const row of data ?? []) {
      const professionalId = row.professional_id as string;
      const amount = Number(row.amount ?? 0);
      const professionalName = this.resolveProfessionalName(
        row.professionals as CompletedAppointmentRow['professionals'],
      );
      const existing = grouped.get(professionalId);

      if (existing) {
        existing.pendingAmount = this.roundCurrency(
          existing.pendingAmount + amount,
        );
        existing.pendingCount += 1;
        continue;
      }

      grouped.set(professionalId, {
        professionalName,
        pendingAmount: this.roundCurrency(amount),
        pendingCount: 1,
      });
    }

    const professionals = [...grouped.entries()]
      .map(([professionalId, item]) => ({
        professionalId,
        professionalName: item.professionalName,
        pendingAmount: item.pendingAmount,
        pendingCount: item.pendingCount,
      }))
      .sort((left, right) =>
        left.professionalName.localeCompare(right.professionalName, 'pt-BR'),
      );

    return {
      enablePayoutControl: tenant.enable_payout_control,
      payoutFrequency: tenant.payout_frequency,
      professionals,
    };
  }

  async settlePayoutsForProfessional(
    tenantId: string,
    planTier: PlanTier,
    professionalId: string,
  ): Promise<void> {
    this.assertFinanceAccess(planTier);

    const tenant = await this.loadTenantFinanceSettings(tenantId);

    if (!tenant.enable_payout_control) {
      throw new BadRequestException(
        'O controle de repasse de funcionários não está ativo para este estabelecimento.',
      );
    }

    const { data: pendingRows, error: fetchError } = await this.supabaseService
      .getClient()
      .from('employee_payouts')
      .select('id, amount')
      .eq('tenant_id', tenantId)
      .eq('professional_id', professionalId)
      .eq('status', 'PENDING');

    if (fetchError) {
      throw new InternalServerErrorException(fetchError.message);
    }

    if (!pendingRows || pendingRows.length === 0) {
      throw new BadRequestException(
        'Não há repasses pendentes para este profissional.',
      );
    }

    const { data: professional, error: professionalError } =
      await this.supabaseService
        .getClient()
        .from('professionals')
        .select('id, name')
        .eq('id', professionalId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

    if (professionalError) {
      throw new InternalServerErrorException(professionalError.message);
    }

    if (!professional) {
      throw new BadRequestException('Profissional não encontrado.');
    }

    const totalAmount = this.roundCurrency(
      pendingRows.reduce(
        (sum, row) => sum + Number(row.amount ?? 0),
        0,
      ),
    );

    if (totalAmount <= 0) {
      throw new BadRequestException(
        'O valor total dos repasses pendentes deve ser maior que zero.',
      );
    }

    const paidAt = new Date().toISOString();
    const payoutIds = pendingRows.map((row) => row.id as string);

    const { error: updateError } = await this.supabaseService
      .getClient()
      .from('employee_payouts')
      .update({
        status: 'PAID',
        paid_at: paidAt,
      })
      .eq('tenant_id', tenantId)
      .eq('professional_id', professionalId)
      .eq('status', 'PENDING')
      .in('id', payoutIds);

    if (updateError) {
      throw new InternalServerErrorException(updateError.message);
    }

    const professionalName =
      (professional.name as string)?.trim() || 'Profissional';

    const cashRegisterId =
      await this.cashRegisterService.resolveOpenCashRegisterId(tenantId);

    const { error: expenseError } = await this.supabaseService
      .getClient()
      .from('cash_flow_entries')
      .insert({
        tenant_id: tenantId,
        cash_register_id: cashRegisterId,
        type: 'EXPENSE',
        amount: totalAmount,
        description: `Repasse de Comissão - ${professionalName}`,
        category: 'COMMISSION_PAYOUT',
        is_recurring: false,
      });

    if (expenseError) {
      throw new InternalServerErrorException(expenseError.message);
    }
  }

  async recordCompletedAppointmentCashFlow(params: {
    tenantId: string;
    appointmentId: string;
    professionalId: string;
    totalPrice: number;
    commissionAmount: number;
    enablePayoutControl: boolean;
  }): Promise<void> {
    const cashRegisterId =
      await this.cashRegisterService.resolveOpenCashRegisterId(params.tenantId);
    const revenueAmount = this.roundCurrency(params.totalPrice);

    if (revenueAmount > 0) {
      const { error: revenueError } = await this.supabaseService
        .getClient()
        .from('cash_flow_entries')
        .insert({
          tenant_id: params.tenantId,
          cash_register_id: cashRegisterId,
          type: 'REVENUE',
          amount: revenueAmount,
          description: 'Receita de atendimento concluído',
          category: 'APPOINTMENT',
          is_recurring: false,
        });

      if (revenueError) {
        throw new InternalServerErrorException(revenueError.message);
      }
    }

    if (!params.enablePayoutControl) {
      return;
    }

    const payoutAmount = this.roundCurrency(params.commissionAmount);

    if (payoutAmount <= 0) {
      return;
    }

    const { error: payoutError } = await this.supabaseService
      .getClient()
      .from('employee_payouts')
      .insert({
        tenant_id: params.tenantId,
        professional_id: params.professionalId,
        appointment_id: params.appointmentId,
        amount: payoutAmount,
        status: 'PENDING',
      });

    if (payoutError) {
      throw new InternalServerErrorException(payoutError.message);
    }
  }

  async getCommissionReport(
    tenantId: string,
    planTier: PlanTier,
    startDate: string,
    endDate: string,
    scopedProfessionalId?: string,
  ): Promise<ProfessionalCommissionSummary[]> {
    this.assertFinanceAccess(planTier);

    const range = this.resolveDateRange(startDate, endDate);

    let query = this.supabaseService
      .getClient()
      .from('appointments')
      .select(
        'professional_id, total_price, commission_amount, professionals(name)',
      )
      .eq('tenant_id', tenantId)
      .eq('status', 'COMPLETED')
      .gte('start_time', range.startIso)
      .lte('start_time', range.endIso);

    if (scopedProfessionalId) {
      query = query.eq('professional_id', scopedProfessionalId);
    }

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = (data ?? []) as CompletedAppointmentRow[];
    const grouped = new Map<string, ProfessionalCommissionSummary>();

    for (const row of rows) {
      const professionalName = this.resolveProfessionalName(row.professionals);
      const existing = grouped.get(row.professional_id);

      const revenue = Number(row.total_price ?? 0);
      const commission = Number(row.commission_amount ?? 0);

      if (existing) {
        existing.totalRevenue = this.roundCurrency(
          existing.totalRevenue + revenue,
        );
        existing.totalCommissionDue = this.roundCurrency(
          existing.totalCommissionDue + commission,
        );
        continue;
      }

      grouped.set(row.professional_id, {
        professionalId: row.professional_id,
        professionalName,
        totalRevenue: this.roundCurrency(revenue),
        totalCommissionDue: this.roundCurrency(commission),
      });
    }

    return [...grouped.values()].sort((left, right) =>
      left.professionalName.localeCompare(right.professionalName, 'pt-BR'),
    );
  }

  private mapFinanceReportAppointmentWithCommission(
    row: Parameters<typeof mapFinanceReportAppointmentRow>[0],
  ) {
    const appointment = mapFinanceReportAppointmentRow(row);

    if (appointment.status !== 'COMPLETED') {
      return appointment;
    }

    const professionalRelation = row.professionals as
      | { commission_percent?: number | null }
      | { commission_percent?: number | null }[]
      | null;
    const professionalRow = Array.isArray(professionalRelation)
      ? professionalRelation[0]
      : professionalRelation;
    const professionalCommissionPercent = Number(
      professionalRow?.commission_percent ?? 0,
    );
    const serviceLines = buildAppointmentCommissionServiceLines(
      row as unknown as Parameters<typeof buildAppointmentCommissionServiceLines>[0],
    );

    return {
      ...appointment,
      commissionAmount: calculateAppointmentCommissionAmount(
        serviceLines,
        professionalCommissionPercent,
      ),
    };
  }

  private async resolveAppointmentIdsForService(
    tenantId: string,
    serviceId: string,
  ): Promise<string[]> {
    const [junctionResult, primaryResult] = await Promise.all([
      this.supabaseService
        .getClient()
        .from('appointment_services')
        .select('appointment_id')
        .eq('tenant_id', tenantId)
        .eq('service_id', serviceId),
      this.supabaseService
        .getClient()
        .from('appointments')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('service_id', serviceId),
    ]);

    if (junctionResult.error) {
      throw new InternalServerErrorException(junctionResult.error.message);
    }

    if (primaryResult.error) {
      throw new InternalServerErrorException(primaryResult.error.message);
    }

    const ids = new Set<string>();

    for (const row of junctionResult.data ?? []) {
      const appointmentId = row.appointment_id as string;
      if (appointmentId) {
        ids.add(appointmentId);
      }
    }

    for (const row of primaryResult.data ?? []) {
      const appointmentId = row.id as string;
      if (appointmentId) {
        ids.add(appointmentId);
      }
    }

    return [...ids];
  }

  private resolveDateRange(
    startDate: string,
    endDate: string,
  ): { startIso: string; endIso: string } {
    const parsedStart = parseISO(startDate);
    const parsedEnd = parseISO(endDate);

    if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
      throw new BadRequestException(
        'Informe datas válidas nos parâmetros start_date e end_date (YYYY-MM-DD).',
      );
    }

    if (isAfter(parsedStart, parsedEnd)) {
      throw new BadRequestException(
        'A data inicial não pode ser posterior à data final.',
      );
    }

    return {
      startIso: startOfDay(parsedStart).toISOString(),
      endIso: endOfDay(parsedEnd).toISOString(),
    };
  }

  private resolveProfessionalName(
    relation: CompletedAppointmentRow['professionals'],
  ): string {
    if (!relation) {
      return 'Profissional';
    }

    if (Array.isArray(relation)) {
      return relation[0]?.name?.trim() || 'Profissional';
    }

    return relation.name?.trim() || 'Profissional';
  }

  private async loadTenantFinanceSettings(tenantId: string): Promise<{
    enable_payout_control: boolean;
    payout_frequency: ReturnType<typeof normalizePayoutFrequency>;
  }> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select('enable_payout_control, payout_frequency')
      .eq('id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new BadRequestException('Estabelecimento não encontrado.');
    }

    return {
      enable_payout_control: Boolean(data.enable_payout_control),
      payout_frequency: normalizePayoutFrequency(
        data.payout_frequency as string | null | undefined,
      ),
    };
  }

  private roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
