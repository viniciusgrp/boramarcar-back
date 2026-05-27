import type { AppointmentStatus } from '../entities/appointment.entity';

export class UpdateAppointmentStatusDto {
  status!: AppointmentStatus;
}
