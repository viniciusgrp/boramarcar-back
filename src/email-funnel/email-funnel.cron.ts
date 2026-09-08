import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EmailFunnelService } from './email-funnel.service';

@Injectable()
export class EmailFunnelCron {
  private readonly logger = new Logger(EmailFunnelCron.name);

  constructor(private readonly emailFunnelService: EmailFunnelService) {}

  @Cron('*/15 * * * *')
  async handleDueEmails(): Promise<void> {
    try {
      const processed = await this.emailFunnelService.processDueEmails();
      if (processed > 0) {
        this.logger.log(`Processed ${processed} trial funnel email action(s).`);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown email funnel cron error';
      this.logger.error(`Trial email funnel cron failed: ${message}`);
    }
  }
}
