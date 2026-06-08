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
import {
  buildFinanceReportSummary,
  isValidFinanceReportStatus,
  mapFinanceReportAppointmentRow,
} from './utils/finance-report-mapper.util';

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
  constructor(private readonly supabaseService: SupabaseService) {}

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
        professionals ( name ),
        services ( name, price ),
        appointment_services (
          service_id,
          sort_order,
          duration_minutes,
          price,
          services ( name )
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
      mapFinanceReportAppointmentRow(
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

  async getCommissionReport(
    tenantId: string,
    planTier: PlanTier,
    startDate: string,
    endDate: string,
  ): Promise<ProfessionalCommissionSummary[]> {
    this.assertFinanceAccess(planTier);

    const range = this.resolveDateRange(startDate, endDate);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select(
        'professional_id, total_price, commission_amount, professionals(name)',
      )
      .eq('tenant_id', tenantId)
      .eq('status', 'COMPLETED')
      .gte('start_time', range.startIso)
      .lte('start_time', range.endIso);

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

  private roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
