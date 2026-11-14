import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { APP_TIME_ZONE } from '../common/app-time-zone';
import { AppointmentsService } from './appointments.service';

@Injectable()
export class AppointmentReminderCron {
  private readonly logger = new Logger(AppointmentReminderCron.name);

  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Cron('0 * * * *', { timeZone: APP_TIME_ZONE })
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
