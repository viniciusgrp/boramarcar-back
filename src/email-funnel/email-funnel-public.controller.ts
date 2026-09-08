import { Controller, Get, Query } from '@nestjs/common';
import { EmailFunnelService } from './email-funnel.service';

@Controller('public/email-funnel')
export class EmailFunnelPublicController {
  constructor(private readonly emailFunnelService: EmailFunnelService) {}

  @Get('opt-out')
  async optOut(@Query('token') token?: string) {
    const updated = await this.emailFunnelService.optOutByToken(token ?? '');
    return {
      ok: true,
      optedOut: updated,
    };
  }
}
