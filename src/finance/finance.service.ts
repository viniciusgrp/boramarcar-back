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
import type { ProfessionalCommissionSummary } from './entities/professional-commission-summary.entity';

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
