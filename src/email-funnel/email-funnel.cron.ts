import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { APP_TIME_ZONE } from '../common/app-time-zone';
import { EmailFunnelService } from './email-funnel.service';

@Injectable()
export class EmailFunnelCron {
  private readonly logger = new Logger(EmailFunnelCron.name);

  constructor(
    private readonly emailFunnelService: EmailFunnelService,
    private readonly configService: ConfigService,
  ) {}

  @Cron('*/15 * * * *', { timeZone: APP_TIME_ZONE })
  async handleDueEmails(): Promise<void> {
    // Kill switch: EMAIL_FUNNEL_CRON_ENABLED=false pauses automatic sends.
    if (
      this.configService.get<string>('EMAIL_FUNNEL_CRON_ENABLED') === 'false'
    ) {
      return;
    }

    try {
      const processed = await this.emailFunnelService.processDueEmails();
      if (processed > 0) {
        this.logger.log(`Processed ${processed} trial funnel email action(s).`);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown email funnel cron error';
      this.logger.error(`Trial email funnel cron failed: ${message}`);
    }
  }
}
