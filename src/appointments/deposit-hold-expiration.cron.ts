import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AppointmentsService } from './appointments.service';

@Injectable()
export class DepositHoldExpirationCron {
  private readonly logger = new Logger(DepositHoldExpirationCron.name);

  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Cron('*/15 * * * *')
  async handleDepositHoldExpiration(): Promise<void> {
    try {
      const cancelled =
        await this.appointmentsService.expireAbandonedDepositHolds();

      if (cancelled > 0) {
        this.logger.log(
          `Deposit hold expiration: ${cancelled} agendamento(s) PENDING_PAYMENT cancelados por abandono.`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown deposit hold expiration error';
      this.logger.error(`Deposit hold expiration cron failed: ${message}`);
    }
  }
}
