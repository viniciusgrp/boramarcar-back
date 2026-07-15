import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import {
  APPOINTMENT_STATUSES,
  type AppointmentStatus,
} from '../entities/appointment.entity';

export class UpdateAppointmentStatusDto {
  @IsEnum(APPOINTMENT_STATUSES)
  status!: AppointmentStatus;

  /** When completing, optionally redeem loyalty points for a reward. */
  @IsOptional()
  @IsUUID()
  loyaltyRewardId?: string;
}
