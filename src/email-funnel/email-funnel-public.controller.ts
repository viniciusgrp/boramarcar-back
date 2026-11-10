import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
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

  @Post('unsubscribe')
  @HttpCode(HttpStatus.OK)
  async unsubscribe(
    @Body() body: { token?: string } | undefined,
    @Query('token') queryToken?: string,
  ) {
    const token = body?.token || queryToken || '';
    const updated = await this.emailFunnelService.optOutByToken(token);
    return {
      ok: true,
      optedOut: updated,
    };
  }
}
