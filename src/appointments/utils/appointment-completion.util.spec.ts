import { BadRequestException } from '@nestjs/common';
import { assertAppointmentStartHasPassed } from './appointment-completion.util';

describe('appointment completion clock', () => {
  const now = new Date(2026, 10, 13, 16, 0, 0);

  it('blocks a start that is still in the future on the store clock', () => {
    expect(() =>
      assertAppointmentStartHasPassed('2026-11-13T16:01:00.000Z', now),
    ).toThrow(BadRequestException);
  });

  it('allows a start that has already reached the store clock', () => {
    expect(() =>
      assertAppointmentStartHasPassed('2026-11-13T16:00:00.000Z', now),
    ).not.toThrow();
    expect(() =>
      assertAppointmentStartHasPassed('2026-11-13T15:00:00.000Z', now),
    ).not.toThrow();
  });
});
