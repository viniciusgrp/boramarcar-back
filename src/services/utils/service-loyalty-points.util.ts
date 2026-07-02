import { BadRequestException } from '@nestjs/common';
import { calculateEarnedPoints } from '../../loyalty/utils/loyalty-points.util';

export interface AppointmentLoyaltyServiceLine {
  price: number;
  loyaltyPointsEarned: number | null;
}

export function hasServiceSpecificLoyaltyPoints(
  loyaltyPointsEarned: number | null | undefined,
): boolean {
  if (loyaltyPointsEarned === null || loyaltyPointsEarned === undefined) {
    return false;
  }

  const parsed = Number(loyaltyPointsEarned);

  return Number.isFinite(parsed) && parsed > 0;
}

export function resolveServiceLoyaltyPointsEarned(
  loyaltyPointsEarned?: number | null,
): number {
  if (loyaltyPointsEarned === undefined || loyaltyPointsEarned === null) {
    return 0;
  }

  if (!Number.isInteger(loyaltyPointsEarned) || loyaltyPointsEarned < 0) {
    throw new BadRequestException(
      'Os pontos de fidelidade do serviço devem ser um número inteiro maior ou igual a zero.',
    );
  }

  return loyaltyPointsEarned;
}

export function extractLoyaltyPointsEarnedFromRelation(
  relation:
    | { loyalty_points_earned?: number | null }
    | { loyalty_points_earned?: number | null }[]
    | null
    | undefined,
): number | null {
  if (!relation) {
    return null;
  }

  const row = Array.isArray(relation) ? relation[0] : relation;
  const value = row?.loyalty_points_earned;

  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.floor(parsed);
}

export function calculateAppointmentLoyaltyPoints(
  serviceLines: AppointmentLoyaltyServiceLine[],
  pointsPerCurrency: number,
  defaultServicePoints: number,
): number {
  if (serviceLines.length === 0) {
    return 0;
  }

  let totalPoints = 0;
  const safeDefaultServicePoints =
    Number.isFinite(defaultServicePoints) && defaultServicePoints > 0
      ? Math.floor(defaultServicePoints)
      : 0;

  for (const line of serviceLines) {
    if (hasServiceSpecificLoyaltyPoints(line.loyaltyPointsEarned)) {
      totalPoints += Math.floor(Number(line.loyaltyPointsEarned));
      continue;
    }

    totalPoints +=
      pointsPerCurrency > 0
        ? calculateEarnedPoints(line.price, pointsPerCurrency)
        : safeDefaultServicePoints;
  }

  return totalPoints;
}
