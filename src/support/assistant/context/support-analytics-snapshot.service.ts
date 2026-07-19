import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../supabase/supabase.service';
import type { TenantAccessContext } from '../../../tenants/entities/tenant-access-context.entity';
import { resolveLinkedProfessionalId } from '../../../tenants/utils/tenant-user-scope.util';
import {
  buildEmptySupportAnalyticsSnapshot,
  buildSupportAnalyticsQueryFilters,
  buildSupportAnalyticsSnapshot,
  resolveSupportAnalyticsPeriod,
  type SupportAnalyticsAppointmentRow,
  type SupportAnalyticsDataScope,
  type SupportAnalyticsSnapshot,
} from './support-analytics-snapshot.builder';

type RelationName = { name: string } | { name: string }[] | null;

interface AnalyticsAppointmentDbRow {
  start_time: string;
  status: string;
  total_price: number | string | null;
  professional_id: string | null;
  professionals: RelationName;
  services: RelationName;
}

function extractRelationName(value: RelationName): string | null {
  if (!value) {
    return null;
  }
  if (Array.isArray(value)) {
    return value[0]?.name?.trim() || null;
  }
  return value.name?.trim() || null;
}

@Injectable()
export class SupportAnalyticsSnapshotService {
  private readonly logger = new Logger(SupportAnalyticsSnapshotService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async buildForContext(
    context: TenantAccessContext,
  ): Promise<SupportAnalyticsSnapshot> {
    const role = context.tenantUser.role;
    const dataScope: SupportAnalyticsDataScope =
      role === 'PROFESSIONAL' ? 'self' : 'tenant';

    if (dataScope === 'self') {
      const professionalId = resolveLinkedProfessionalId(context.tenantUser);
      if (!professionalId) {
        return buildEmptySupportAnalyticsSnapshot({
          dataScope: 'self',
          emptyReason: 'professional_not_linked',
        });
      }

      return this.fetchAndAggregate({
        tenantId: context.tenant.id,
        dataScope: 'self',
        professionalId,
      });
    }

    return this.fetchAndAggregate({
      tenantId: context.tenant.id,
      dataScope: 'tenant',
      professionalId: null,
    });
  }

  private async fetchAndAggregate(params: {
    tenantId: string;
    dataScope: SupportAnalyticsDataScope;
    professionalId: string | null;
  }): Promise<SupportAnalyticsSnapshot> {
    const filters = buildSupportAnalyticsQueryFilters(params);
    const period = resolveSupportAnalyticsPeriod();

    let query = this.supabaseService
      .getClient()
      .from('appointments')
      .select(
        `
        start_time,
        status,
        total_price,
        professional_id,
        professionals ( name ),
        services!service_id ( name )
      `,
      )
      .eq('tenant_id', filters.tenantId)
      .gte('start_time', period.periodFromIso)
      .lte('start_time', period.periodToIso);

    if (filters.requiresProfessionalFilter && filters.professionalId) {
      query = query.eq('professional_id', filters.professionalId);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.warn(
        `Failed to load analytics appointments for tenant ${filters.tenantId}: ${error.message}`,
      );
      return buildEmptySupportAnalyticsSnapshot({
        dataScope: params.dataScope,
        emptyReason: 'no_data',
      });
    }

    const rows: SupportAnalyticsAppointmentRow[] = (
      (data as AnalyticsAppointmentDbRow[] | null) ?? []
    ).map((row) => ({
      start_time: row.start_time,
      status: row.status,
      total_price: row.total_price,
      professional_id: row.professional_id,
      professional_name: extractRelationName(row.professionals),
      service_name: extractRelationName(row.services),
    }));

    return buildSupportAnalyticsSnapshot({
      rows,
      dataScope: params.dataScope,
    });
  }
}
