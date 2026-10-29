import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import {
  MAX_APPOINTMENT_DURATION_MINUTES,
  MIN_APPOINTMENT_DURATION_MINUTES,
} from '../utils/appointment-duration.util';

export class UpdateAppointmentDurationDto {
  @Type(() => Number)
  @IsInt()
  @Min(MIN_APPOINTMENT_DURATION_MINUTES)
  @Max(MAX_APPOINTMENT_DURATION_MINUTES)
  durationMinutes!: number;
}
