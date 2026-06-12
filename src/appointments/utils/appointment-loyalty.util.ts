import type { AppointmentLoyaltyServiceLine } from '../../services/utils/service-loyalty-points.util';
import { extractLoyaltyPointsEarnedFromRelation } from '../../services/utils/service-loyalty-points.util';

interface AppointmentServiceLoyaltyRow {
  service_id?: string;
  price: number | null;
  services?:
    | { loyalty_points_earned?: number | null }
    | { loyalty_points_earned?: number | null }[]
    | null;
}

interface AppointmentLoyaltySourceRow {
  service_id: string;
  total_price: number | null;
  appointment_services?:
    | AppointmentServiceLoyaltyRow[]
    | AppointmentServiceLoyaltyRow
    | null;
  services?:
    | { loyalty_points_earned?: number | null; price?: number | null }
    | { loyalty_points_earned?: number | null; price?: number | null }[]
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

export function buildAppointmentLoyaltyServiceLines(
  row: AppointmentLoyaltySourceRow,
): AppointmentLoyaltyServiceLine[] {
  const junctionRows = normalizeRelationRows(row.appointment_services);

  if (junctionRows.length > 0) {
    return junctionRows.map((junctionRow) => ({
      price: Number(junctionRow.price ?? 0),
      loyaltyPointsEarned: extractLoyaltyPointsEarnedFromRelation(
        junctionRow.services,
      ),
    }));
  }

  const primaryService = normalizeRelationRows(row.services)[0];

  return [
    {
      price: Number(row.total_price ?? primaryService?.price ?? 0),
      loyaltyPointsEarned: extractLoyaltyPointsEarnedFromRelation(row.services),
    },
  ];
}
