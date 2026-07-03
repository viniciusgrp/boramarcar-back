import { BadRequestException } from '@nestjs/common';

export const BOOKING_SLOT_INTERVAL_OPTIONS = [5, 10, 15, 20, 30, 60] as const;

export type BookingSlotIntervalMinutes =
  (typeof BOOKING_SLOT_INTERVAL_OPTIONS)[number];

export const DEFAULT_BOOKING_SLOT_INTERVAL_MINUTES = 15;

export function isBookingSlotIntervalMinutes(
  value: number,
): value is BookingSlotIntervalMinutes {
  return BOOKING_SLOT_INTERVAL_OPTIONS.includes(
    value as BookingSlotIntervalMinutes,
  );
}

export function normalizeBookingSlotIntervalMinutes(
  value: number | null | undefined,
): BookingSlotIntervalMinutes {
  const parsed = Number(value);

  if (isBookingSlotIntervalMinutes(parsed)) {
    return parsed;
  }

  return DEFAULT_BOOKING_SLOT_INTERVAL_MINUTES;
}

export function assertBookingSlotIntervalMinutes(
  value: number | null | undefined,
): BookingSlotIntervalMinutes {
  const parsed = Number(value);

  if (!isBookingSlotIntervalMinutes(parsed)) {
    throw new BadRequestException(
      `O intervalo de agendamento deve ser um dos valores: ${BOOKING_SLOT_INTERVAL_OPTIONS.join(', ')}.`,
    );
  }

  return parsed;
}
