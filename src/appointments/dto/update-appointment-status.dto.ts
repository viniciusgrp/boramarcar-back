import type { AppointmentStatus } from '../entities/appointment.entity';

export class UpdateAppointmentStatusDto {
  status!: AppointmentStatus;
  /** When completing, optionally redeem loyalty points for a reward. */
  loyaltyRewardId?: string;
}
