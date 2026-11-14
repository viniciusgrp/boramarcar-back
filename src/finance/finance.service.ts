import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  differenceInMinutes,
  endOfDay,
  isAfter,
  parseISO,
  startOfDay,
} from 'date-fns';
import { SupabaseService } from '../supabase/supabase.service';
import type { PlanTier } from '../tenants/entities/plan-tier.type';
import { canConfigureCommissions } from '../professionals/utils/professional-commission.util';
import type {
  FinanceReportFilters,
  FinanceReportProductSale,
  FinanceReportResponse,
} from './entities/finance-report.entity';
import type {
  CommissionAppointmentItem,
  CommissionReportResponse,
  ProfessionalCommissionSummary,
} from './entities/professional-commission-summary.entity';
import type {
  CashFlowLedgerEntry,
  CashFlowSummary,
} from './entities/cash-flow-entry.entity';
import type { PayoutSummaryResponse } from './entities/employee-payout.entity';
import type { PendingPayoutServicesResponse } from './entities/employee-payout.entity';
import { normalizePayoutFrequency } from '../tenants/entities/payout-frequency.type';
import {
  buildFinanceReportSummary,
  isValidFinanceReportStatus,
  mapFinanceReportAppointmentRow,
  mapFinanceReportProductSale,
  productSaleEffectiveAt,
} from './utils/finance-report-mapper.util';
import { buildAppointmentCommissionServiceLines } from '../appointments/utils/appointment-commission.util';
import { calculateAppointmentCommissionAmount } from '../services/utils/service-commission.util';
import { CashRegisterService } from './cash-register.service';

interface EmployeePayoutStatusRow {
  appointment_id: string | null;
  status: 'PENDING' | 'PAID';
  paid_at: string | null;
}

interface PendingPayoutRow {
  id: string;
  amount: number | string | null;
  created_at: string;
  appointment_id: string | null;
  appointments:
    | Parameters<typeof mapFinanceReportAppointmentRow>[0]
    | Parameters<typeof mapFinanceReportAppointmentRow>[0][]
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
        productSales: [],
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
    const productSales = filters.serviceId
      ? []
      : await this.loadProductSalesForReport(tenantId, filters);

    return {
      summary: buildFinanceReportSummary(appointments, productSales),
      appointments,
      productSales,
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

  async listCashFlowEntries(
    tenantId: string,
    planTier: PlanTier,
  ): Promise<CashFlowLedgerEntry[]> {
    this.assertFinanceAccess(planTier);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('cash_flow_entries')
      .select(
        `
        id,
        type,
        amount,
        description,
        category,
        payment_method,
        appointment_id,
        product_sale_id,
        cash_register_id,
        created_at
      `,
      )
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((row) => ({
      id: String(row.id),
      type: row.type === 'EXPENSE' ? 'EXPENSE' : 'REVENUE',
      amount: this.roundCurrency(Number(row.amount ?? 0)),
      description: String(row.description ?? ''),
      category: String(row.category ?? ''),
      paymentMethod:
        typeof row.payment_method === 'string' ? row.payment_method : null,
      appointmentId:
        typeof row.appointment_id === 'string' ? row.appointment_id : null,
      productSaleId:
        typeof row.product_sale_id === 'string' ? row.product_sale_id : null,
      cashRegisterId:
        typeof row.cash_register_id === 'string' ? row.cash_register_id : null,
      createdAt: String(row.created_at ?? ''),
    }));
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
        row.professionals as
          | { name: string }
          | { name: string }[]
          | null,
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

  async getPendingPayoutServicesForProfessional(
    tenantId: string,
    planTier: PlanTier,
    professionalId: string,
  ): Promise<PendingPayoutServicesResponse> {
    this.assertFinanceAccess(planTier);

    const tenant = await this.loadTenantFinanceSettings(tenantId);

    if (!tenant.enable_payout_control) {
      throw new BadRequestException(
        'O controle de repasse de funcionários não está ativo para este estabelecimento.',
      );
    }

    const { data: professional, error: professionalError } =
      await this.supabaseService
        .getClient()
        .from('professionals')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .eq('id', professionalId)
        .maybeSingle();

    if (professionalError) {
      throw new InternalServerErrorException(professionalError.message);
    }

    if (!professional) {
      throw new BadRequestException('Profissional não encontrado.');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('employee_payouts')
      .select(
        `
        id,
        amount,
        created_at,
        appointment_id,
        appointments (
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
          professionals ( name ),
          services!service_id ( name, price ),
          appointment_services (
            sort_order,
            service_id,
            duration_minutes,
            price,
            services!service_id ( name )
          )
        )
      `,
      )
      .eq('tenant_id', tenantId)
      .eq('professional_id', professionalId)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const items = (data ?? []).map((row) =>
      this.mapPendingPayoutServiceItem(row as PendingPayoutRow),
    );

    const totalPendingAmount = this.roundCurrency(
      items.reduce((sum, item) => sum + item.commissionAmount, 0),
    );

    return {
      professionalId,
      professionalName: (professional.name as string)?.trim() || 'Profissional',
      totalPendingAmount,
      items,
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

  async requireOpenCashRegisterId(
    tenantId: string,
    cashRegisterId?: string | null,
  ): Promise<string> {
    return this.cashRegisterService.requireOpenCashRegisterId(
      tenantId,
      cashRegisterId,
    );
  }

  async recordCompletedAppointmentCashFlow(params: {
    tenantId: string;
    appointmentId: string;
    professionalId: string;
    totalPrice: number;
    commissionAmount: number;
    enablePayoutControl: boolean;
    cashRegisterId: string;
    paymentMethod: 'CASH' | 'CARD' | 'PIX' | 'OTHER';
  }): Promise<void> {
    const revenueAmount = this.roundCurrency(params.totalPrice);
    const client = this.supabaseService.getClient();

    if (revenueAmount > 0) {
      const { data: existingEntries, error: existingError } = await client
        .from('cash_flow_entries')
        .select('type, amount, category')
        .eq('tenant_id', params.tenantId)
        .eq('appointment_id', params.appointmentId)
        .in('category', ['APPOINTMENT', 'APPOINTMENT_REVERSAL']);

      if (existingError) {
        throw new InternalServerErrorException(existingError.message);
      }

      const net = this.appointmentCashNet(existingEntries ?? []);

      if (net <= 0) {
        const { error: revenueError } = await client
          .from('cash_flow_entries')
          .insert({
            tenant_id: params.tenantId,
            cash_register_id: params.cashRegisterId,
            appointment_id: params.appointmentId,
            payment_method: params.paymentMethod,
            type: 'REVENUE',
            amount: revenueAmount,
            description: `Receita de atendimento concluído (${this.paymentMethodLabel(params.paymentMethod)})`,
            category: 'APPOINTMENT',
            is_recurring: false,
          });

        if (revenueError) {
          throw new InternalServerErrorException(revenueError.message);
        }
      }
    }

    if (!params.enablePayoutControl) {
      return;
    }

    const payoutAmount = this.roundCurrency(params.commissionAmount);

    if (payoutAmount <= 0) {
      return;
    }

    const { data: existingPayouts, error: payoutLookupError } = await client
      .from('employee_payouts')
      .select('id')
      .eq('tenant_id', params.tenantId)
      .eq('appointment_id', params.appointmentId)
      .eq('status', 'PENDING')
      .limit(1);

    if (payoutLookupError) {
      throw new InternalServerErrorException(payoutLookupError.message);
    }

    if ((existingPayouts ?? []).length > 0) {
      return;
    }

    const { error: payoutError } = await client
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

  async reverseCompletedAppointmentCashFlow(params: {
    tenantId: string;
    appointmentId: string;
  }): Promise<void> {
    const client = this.supabaseService.getClient();

    // Remove the original revenue (and any legacy reversal rows) instead of
    // inserting a compensating expense that inflates cash-register totals.
    const { error: deleteEntriesError } = await client
      .from('cash_flow_entries')
      .delete()
      .eq('tenant_id', params.tenantId)
      .eq('appointment_id', params.appointmentId)
      .in('category', ['APPOINTMENT', 'APPOINTMENT_REVERSAL']);

    if (deleteEntriesError) {
      throw new InternalServerErrorException(deleteEntriesError.message);
    }

    const { error: deleteError } = await client
      .from('employee_payouts')
      .delete()
      .eq('tenant_id', params.tenantId)
      .eq('appointment_id', params.appointmentId)
      .eq('status', 'PENDING')
      .gte('amount', 0);

    if (deleteError) {
      throw new InternalServerErrorException(deleteError.message);
    }
  }

  /** Mirrors recordCompletedAppointmentCashFlow for product sales (direct or linked to an appointment). */
  async recordProductSaleCashFlow(params: {
    tenantId: string;
    productSaleId: string;
    appointmentId?: string | null;
    paymentMethod?: string | null;
    professionalId: string | null;
    totalAmount: number;
    commissionAmount: number;
    enablePayoutControl: boolean;
  }): Promise<void> {
    const cashRegisterId =
      await this.cashRegisterService.resolveOpenCashRegisterId(params.tenantId);
    const revenueAmount = this.roundCurrency(params.totalAmount);

    if (revenueAmount > 0) {
      const { error: revenueError } = await this.supabaseService
        .getClient()
        .from('cash_flow_entries')
        .insert({
          tenant_id: params.tenantId,
          cash_register_id: cashRegisterId,
          product_sale_id: params.productSaleId,
          appointment_id: params.appointmentId?.trim() || null,
          payment_method: params.paymentMethod?.trim() || null,
          type: 'REVENUE',
          amount: revenueAmount,
          description: 'Receita de venda de produtos',
          category: 'PRODUCT_SALE',
          is_recurring: false,
        });

      if (revenueError) {
        throw new InternalServerErrorException(revenueError.message);
      }
    }

    if (!params.enablePayoutControl || !params.professionalId) {
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
        product_sale_id: params.productSaleId,
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
  ): Promise<CommissionReportResponse> {
    this.assertFinanceAccess(planTier);

    const range = this.resolveDateRange(startDate, endDate);
    const tenantSettings = await this.loadTenantFinanceSettings(tenantId);

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
        professionals ( name ),
        services!service_id ( name, price ),
        appointment_services (
          service_id,
          sort_order,
          duration_minutes,
          price,
          services!service_id ( name )
        )
      `,
      )
      .eq('tenant_id', tenantId)
      .eq('status', 'COMPLETED')
      .gte('start_time', range.startIso)
      .lte('start_time', range.endIso)
      .order('start_time', { ascending: false });

    if (scopedProfessionalId) {
      query = query.eq('professional_id', scopedProfessionalId);
    }

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = (data ?? []) as Parameters<
      typeof mapFinanceReportAppointmentRow
    >[0][];
    const appointmentIds = rows.map((row) => row.id);
    const payoutStatusByAppointment = tenantSettings.enable_payout_control
      ? await this.loadPayoutStatusByAppointment(tenantId, appointmentIds)
      : new Map<string, EmployeePayoutStatusRow>();

    const grouped = new Map<string, ProfessionalCommissionSummary>();

    for (const row of rows) {
      const mapped = mapFinanceReportAppointmentRow(row);
      const payout = payoutStatusByAppointment.get(mapped.id);
      const commissionItem = this.mapCommissionAppointmentItem(
        mapped,
        payout,
        tenantSettings.enable_payout_control,
      );

      const existing = grouped.get(row.professional_id);
      const revenue = commissionItem.totalPrice;
      const commission = commissionItem.commissionAmount;

      if (existing) {
        existing.totalRevenue = this.roundCurrency(
          existing.totalRevenue + revenue,
        );
        existing.totalCommissionDue = this.roundCurrency(
          existing.totalCommissionDue + commission,
        );
        existing.appointmentCount += 1;
        existing.items.push(commissionItem);
        continue;
      }

      grouped.set(row.professional_id, {
        professionalId: row.professional_id,
        professionalName: mapped.professionalName,
        totalRevenue: this.roundCurrency(revenue),
        totalCommissionDue: this.roundCurrency(commission),
        appointmentCount: 1,
        items: [commissionItem],
      });
    }

    const productSales = await this.loadProductSalesForReport(tenantId, {
      startDate,
      endDate,
      professionalId: scopedProfessionalId,
      status: 'COMPLETED',
    });

    for (const sale of productSales) {
      if (!sale.professionalId || !sale.countsTowardRevenue) {
        continue;
      }

      const commissionItem = this.mapCommissionProductSaleItem(sale);
      const existing = grouped.get(sale.professionalId);

      if (existing) {
        existing.totalRevenue = this.roundCurrency(
          existing.totalRevenue + commissionItem.totalPrice,
        );
        existing.totalCommissionDue = this.roundCurrency(
          existing.totalCommissionDue + commissionItem.commissionAmount,
        );
        existing.items.push(commissionItem);
        continue;
      }

      grouped.set(sale.professionalId, {
        professionalId: sale.professionalId,
        professionalName: sale.professionalName?.trim() || 'Profissional',
        totalRevenue: commissionItem.totalPrice,
        totalCommissionDue: commissionItem.commissionAmount,
        appointmentCount: 0,
        items: [commissionItem],
      });
    }

    const professionals = [...grouped.values()]
      .map((summary) => ({
        ...summary,
        items: [...summary.items].sort((left, right) =>
          right.startTime.localeCompare(left.startTime),
        ),
      }))
      .sort((left, right) =>
        left.professionalName.localeCompare(right.professionalName, 'pt-BR'),
      );

    return {
      enablePayoutControl: tenantSettings.enable_payout_control,
      professionals,
    };
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

  private mapCommissionProductSaleItem(
    sale: FinanceReportProductSale,
  ): CommissionAppointmentItem {
    return {
      source: 'PRODUCT_SALE',
      appointmentId: sale.id,
      productSaleId: sale.id,
      serviceName: 'Venda de produto',
      customerName: sale.customerName ?? '',
      customerPhone: '',
      startTime: productSaleEffectiveAt(sale),
      endTime: productSaleEffectiveAt(sale),
      durationMinutes: 0,
      totalPrice: this.roundCurrency(sale.recognizedRevenue),
      commissionAmount: this.roundCurrency(sale.commissionAmount),
      payoutStatus: null,
      paidAt: null,
    };
  }

  private async loadProductSalesForReport(
    tenantId: string,
    filters: FinanceReportFilters,
  ): Promise<FinanceReportProductSale[]> {
    if (
      filters.status &&
      filters.status !== 'COMPLETED' &&
      filters.status !== 'CANCELLED'
    ) {
      return [];
    }

    let query = this.supabaseService
      .getClient()
      .from('product_sales')
      .select(
        `
        id,
        created_at,
        status,
        customer_name,
        professional_id,
        total_amount,
        commission_amount,
        professionals ( name ),
        appointments ( start_time )
      `,
      )
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (filters.professionalId) {
      query = query.eq('professional_id', filters.professionalId);
    }

    if (filters.customerId) {
      query = query.eq('customer_id', filters.customerId);
    }

    if (filters.status === 'COMPLETED' || filters.status === 'CANCELLED') {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const mapped = (data ?? []).map((row) =>
      mapFinanceReportProductSale(
        row as Parameters<typeof mapFinanceReportProductSale>[0],
      ),
    );

    if (!filters.startDate || !filters.endDate) {
      return mapped;
    }

    // Filter by appointment day when linked, else sale timestamp (B4).
    const range = this.resolveDateRange(filters.startDate, filters.endDate);
    const startMs = Date.parse(range.startIso);
    const endMs = Date.parse(range.endIso);

    return mapped.filter((sale) => {
      const saleMs = Date.parse(productSaleEffectiveAt(sale));
      if (!Number.isFinite(saleMs)) {
        return false;
      }
      return saleMs >= startMs && saleMs <= endMs;
    });
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

  private mapPendingPayoutServiceItem(
    row: PendingPayoutRow,
  ): PendingPayoutServicesResponse['items'][number] {
    const appointmentRelation = row.appointments;
    const appointment = Array.isArray(appointmentRelation)
      ? appointmentRelation[0]
      : appointmentRelation;

    if (appointment) {
      const mapped = mapFinanceReportAppointmentRow(appointment);

      return {
        payoutId: row.id,
        appointmentId: row.appointment_id,
        serviceName: mapped.serviceName,
        customerName: mapped.customerName,
        appointmentDate: mapped.startTime,
        commissionAmount: this.roundCurrency(Number(row.amount ?? 0)),
        totalPrice: mapped.totalPrice,
        createdAt: row.created_at,
      };
    }

    return {
      payoutId: row.id,
      appointmentId: row.appointment_id,
      serviceName: 'Atendimento sem vínculo',
      customerName: null,
      appointmentDate: null,
      commissionAmount: this.roundCurrency(Number(row.amount ?? 0)),
      totalPrice: null,
      createdAt: row.created_at,
    };
  }

  private mapCommissionAppointmentItem(
    appointment: ReturnType<typeof mapFinanceReportAppointmentRow>,
    payout: EmployeePayoutStatusRow | undefined,
    enablePayoutControl: boolean,
  ): CommissionAppointmentItem {
    const durationMinutes = Math.max(
      0,
      differenceInMinutes(
        parseISO(appointment.endTime),
        parseISO(appointment.startTime),
      ),
    );

    return {
      source: 'APPOINTMENT',
      appointmentId: appointment.id,
      productSaleId: null,
      serviceName: appointment.serviceName,
      customerName: appointment.customerName,
      customerPhone: appointment.customerPhone,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      durationMinutes,
      totalPrice: this.roundCurrency(appointment.totalPrice),
      commissionAmount: this.roundCurrency(appointment.commissionAmount),
      payoutStatus:
        enablePayoutControl && payout
          ? payout.status
          : null,
      paidAt: enablePayoutControl && payout ? payout.paid_at : null,
    };
  }

  private async loadPayoutStatusByAppointment(
    tenantId: string,
    appointmentIds: string[],
  ): Promise<Map<string, EmployeePayoutStatusRow>> {
    if (appointmentIds.length === 0) {
      return new Map();
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('employee_payouts')
      .select('appointment_id, status, paid_at')
      .eq('tenant_id', tenantId)
      .in('appointment_id', appointmentIds);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const map = new Map<string, EmployeePayoutStatusRow>();

    for (const row of (data ?? []) as EmployeePayoutStatusRow[]) {
      if (!row.appointment_id) {
        continue;
      }

      map.set(row.appointment_id, row);
    }

    return map;
  }

  private resolveProfessionalName(
    relation:
      | { name: string }
      | { name: string }[]
      | null,
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

  private paymentMethodLabel(
    method: 'CASH' | 'CARD' | 'PIX' | 'OTHER',
  ): string {
    switch (method) {
      case 'CASH':
        return 'Dinheiro';
      case 'CARD':
        return 'Cartão';
      case 'PIX':
        return 'PIX';
      default:
        return 'Outro';
    }
  }

  private appointmentCashNet(
    entries: Array<{
      type?: string | null;
      amount?: number | string | null;
      category?: string | null;
    }>,
  ): number {
    let net = 0;

    for (const entry of entries) {
      const amount = this.roundCurrency(Number(entry.amount ?? 0));

      if (entry.category === 'APPOINTMENT' && entry.type === 'REVENUE') {
        net += amount;
      }

      if (
        entry.category === 'APPOINTMENT_REVERSAL' &&
        entry.type === 'EXPENSE'
      ) {
        net -= amount;
      }
    }

    return this.roundCurrency(net);
  }

  private roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
