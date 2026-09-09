import { BadRequestException } from '@nestjs/common';
import {
  DEFAULT_BOOKING_SLOT_INTERVAL_MINUTES,
  assertBookingSlotIntervalMinutes,
  isBookingSlotIntervalMinutes,
  normalizeBookingSlotIntervalMinutes,
} from './booking-slot-interval.util';

describe('booking-slot-interval.util', () => {
  it('accepts the configured interval options', () => {
    expect(isBookingSlotIntervalMinutes(15)).toBe(true);
    expect(isBookingSlotIntervalMinutes(7)).toBe(false);
  });

  it('falls back to 15 minutes for invalid values', () => {
    expect(normalizeBookingSlotIntervalMinutes(30)).toBe(30);
    expect(normalizeBookingSlotIntervalMinutes(7)).toBe(
      DEFAULT_BOOKING_SLOT_INTERVAL_MINUTES,
    );
    expect(normalizeBookingSlotIntervalMinutes(null)).toBe(15);
  });

  it('asserts valid intervals and rejects others', () => {
    expect(assertBookingSlotIntervalMinutes(20)).toBe(20);
    expect(() => assertBookingSlotIntervalMinutes(7)).toThrow(BadRequestException);
  });
});
