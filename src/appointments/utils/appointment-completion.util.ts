import { BadRequestException } from '@nestjs/common';
import {
  getWallClockNow,
  parseWallClockDateTime,
} from '../../schedule/utils/wall-clock-datetime.util';

/**
 * Appointment times are store wall-clock digits stored in the UTC fields.
 * Completing is allowed only once that clock time has been reached.
 */
export function assertAppointmentStartHasPassed(
  startTimeIso: string,
  now: Date = getWallClockNow(),
): void {
  const start = parseWallClockDateTime(startTimeIso);

  if (start.getTime() > now.getTime()) {
    throw new BadRequestException(
      'Este horário ainda não aconteceu. Conclua só depois do horário marcado.',
    );
  }
}
