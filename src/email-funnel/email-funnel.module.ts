import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { PlatformModule } from '../platform/platform.module';
import { EmailFunnelController } from './email-funnel.controller';
import { EmailFunnelCron } from './email-funnel.cron';
import { EmailFunnelPublicController } from './email-funnel-public.controller';
import { EmailFunnelService } from './email-funnel.service';

@Module({
  imports: [AuthModule, MailModule, PlatformModule],
  controllers: [EmailFunnelController, EmailFunnelPublicController],
  providers: [EmailFunnelService, EmailFunnelCron],
  exports: [EmailFunnelService],
})
export class EmailFunnelModule {}
