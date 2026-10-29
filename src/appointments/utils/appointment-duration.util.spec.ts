import { BadRequestException } from '@nestjs/common';
import {
  assertAppointmentDurationMinutes,
  canEditAppointmentDuration,
  resolveAppointmentDurationMinutes,
} from './appointment-duration.util';

describe('appointment duration', () => {
  it('keeps the catalog duration when no override is sent', () => {
    expect(resolveAppointmentDurationMinutes(60, undefined)).toBe(60);
    expect(resolveAppointmentDurationMinutes(60, null)).toBe(60);
  });

  it('accepts a shorter or longer integer duration', () => {
    expect(resolveAppointmentDurationMinutes(60, 45)).toBe(45);
    expect(resolveAppointmentDurationMinutes(60, 90)).toBe(90);
    expect(resolveAppointmentDurationMinutes(60, 1)).toBe(1);
    expect(resolveAppointmentDurationMinutes(60, 1440)).toBe(1440);
  });

  it('rejects durations outside 1 to 1440 minutes', () => {
    expect(() => assertAppointmentDurationMinutes(0)).toThrow(BadRequestException);
    expect(() => assertAppointmentDurationMinutes(-15)).toThrow(BadRequestException);
    expect(() => assertAppointmentDurationMinutes(1441)).toThrow(BadRequestException);
    expect(() => assertAppointmentDurationMinutes(30.5)).toThrow(BadRequestException);
  });

  it('allows duration edits only while the appointment still occupies the agenda', () => {
    expect(canEditAppointmentDuration('CONFIRMED')).toBe(true);
    expect(canEditAppointmentDuration('PENDING')).toBe(true);
    expect(canEditAppointmentDuration('PENDING_APPROVAL')).toBe(true);
    expect(canEditAppointmentDuration('PENDING_PAYMENT')).toBe(true);
    expect(canEditAppointmentDuration('COMPLETED')).toBe(false);
    expect(canEditAppointmentDuration('CANCELLED')).toBe(false);
    expect(canEditAppointmentDuration('NO_SHOW')).toBe(false);
  });
});
