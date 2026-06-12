import { calculateCommissionAmount } from '../../professionals/utils/professional-commission.util';

export interface AppointmentCommissionServiceLine {
  serviceId: string;
  price: number;
  customCommissionRate: number | null;
}

export function isValidCustomCommissionRate(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return false;
  }

  return true;
}

export function resolveCommissionPercentForServiceLine(
  customCommissionRate: number | null | undefined,
  professionalCommissionPercent: number,
): number {
  if (isValidCustomCommissionRate(customCommissionRate)) {
    return Math.round(Number(customCommissionRate) * 100) / 100;
  }

  const safeProfessionalPercent = Number.isFinite(professionalCommissionPercent)
    ? professionalCommissionPercent
    : 0;

  return safeProfessionalPercent;
}

export function calculateAppointmentCommissionAmount(
  serviceLines: AppointmentCommissionServiceLine[],
  professionalCommissionPercent: number,
): number {
  if (serviceLines.length === 0) {
    return 0;
  }

  let totalCommission = 0;

  for (const line of serviceLines) {
    const commissionPercent = resolveCommissionPercentForServiceLine(
      line.customCommissionRate,
      professionalCommissionPercent,
    );

    totalCommission += calculateCommissionAmount(line.price, commissionPercent);
  }

  return Math.round(totalCommission * 100) / 100;
}

export function extractCustomCommissionRateFromRelation(
  relation:
    | { custom_commission_rate?: number | null }
    | { custom_commission_rate?: number | null }[]
    | null
    | undefined,
): number | null {
  if (!relation) {
    return null;
  }

  const row = Array.isArray(relation) ? relation[0] : relation;
  const value = row?.custom_commission_rate;

  if (!isValidCustomCommissionRate(value)) {
    return null;
  }

  return Number(value);
}
