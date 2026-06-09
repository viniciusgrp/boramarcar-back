import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AppointmentsService } from './appointments.service';

@Injectable()
export class AppointmentReminderCron {
  private readonly logger = new Logger(AppointmentReminderCron.name);

  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Cron('0 * * * *')
  async handleHourlyReminders(): Promise<void> {
    try {
      await this.appointmentsService.sendDueAppointmentReminders();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown reminder cron error';
      this.logger.error(`Appointment reminder cron failed: ${message}`);
    }
  }
}
