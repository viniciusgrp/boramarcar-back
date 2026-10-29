import { BadRequestException } from '@nestjs/common';

export const MIN_APPOINTMENT_DURATION_MINUTES = 1;
export const MAX_APPOINTMENT_DURATION_MINUTES = 24 * 60;

const DURATION_EDITABLE_STATUSES = new Set([
  'PENDING',
  'PENDING_PAYMENT',
  'PENDING_APPROVAL',
  'CONFIRMED',
]);

export function assertAppointmentDurationMinutes(durationMinutes: number): void {
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < MIN_APPOINTMENT_DURATION_MINUTES ||
    durationMinutes > MAX_APPOINTMENT_DURATION_MINUTES
  ) {
    throw new BadRequestException(
      `A duração deve ser um número inteiro de minutos entre ${MIN_APPOINTMENT_DURATION_MINUTES} e ${MAX_APPOINTMENT_DURATION_MINUTES}.`,
    );
  }
}

/**
 * Uses the catalog sum when the staff does not send an override.
 * A provided value replaces the whole appointment length, not the service price.
 */
export function resolveAppointmentDurationMinutes(
  catalogDurationMinutes: number,
  requestedDurationMinutes?: number | null,
): number {
  if (requestedDurationMinutes === undefined || requestedDurationMinutes === null) {
    return catalogDurationMinutes;
  }

  assertAppointmentDurationMinutes(requestedDurationMinutes);
  return requestedDurationMinutes;
}

export function canEditAppointmentDuration(status: string): boolean {
  return DURATION_EDITABLE_STATUSES.has(status);
}
