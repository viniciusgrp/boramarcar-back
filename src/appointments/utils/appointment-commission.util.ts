import type { AppointmentCommissionServiceLine } from '../../services/utils/service-commission.util';
import { extractCustomCommissionRateFromRelation } from '../../services/utils/service-commission.util';

interface AppointmentServiceCommissionRow {
  service_id?: string;
  price: number | null;
  services?:
    | { custom_commission_rate?: number | null }
    | { custom_commission_rate?: number | null }[]
    | null;
}

interface AppointmentCommissionSourceRow {
  service_id: string;
  total_price: number | null;
  appointment_services?:
    | AppointmentServiceCommissionRow[]
    | AppointmentServiceCommissionRow
    | null;
  services?:
    | { custom_commission_rate?: number | null; price?: number | null }
    | { custom_commission_rate?: number | null; price?: number | null }[]
    | null;
}

function normalizeRelationRows<T>(relation: T | T[] | null | undefined): T[] {
  if (!relation) {
    return [];
  }

  if (Array.isArray(relation)) {
    return relation;
  }

  return [relation];
}

export function buildAppointmentCommissionServiceLines(
  row: AppointmentCommissionSourceRow,
): AppointmentCommissionServiceLine[] {
  const junctionRows = normalizeRelationRows(row.appointment_services);

  if (junctionRows.length > 0) {
    return junctionRows.map((junctionRow) => ({
      serviceId: junctionRow.service_id ?? row.service_id,
      price: Number(junctionRow.price ?? 0),
      customCommissionRate: extractCustomCommissionRateFromRelation(
        junctionRow.services,
      ),
    }));
  }

  const primaryService = normalizeRelationRows(row.services)[0];

  return [
    {
      serviceId: row.service_id,
      price: Number(row.total_price ?? primaryService?.price ?? 0),
      customCommissionRate: extractCustomCommissionRateFromRelation(
        row.services,
      ),
    },
  ];
}
