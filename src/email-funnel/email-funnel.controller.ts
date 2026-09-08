import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PlatformAdminGuard } from '../platform/guards/platform-admin.guard';
import {
  SendEmailFunnelPreviewDto,
  UpdateEmailFunnelStepDto,
} from './dto/email-funnel.dto';
import { EmailFunnelService } from './email-funnel.service';

@Controller('platform/email-funnel')
@UseGuards(AuthGuard, PlatformAdminGuard)
export class EmailFunnelController {
  constructor(private readonly emailFunnelService: EmailFunnelService) {}

  @Get('steps')
  listSteps() {
    return this.emailFunnelService.listSteps();
  }

  @Patch('steps/:stepKey')
  updateStep(
    @Param('stepKey') stepKey: string,
    @Body() dto: UpdateEmailFunnelStepDto,
  ) {
    return this.emailFunnelService.updateStep(stepKey, dto);
  }

  @Post('test-send')
  sendTest(@Body() dto: SendEmailFunnelPreviewDto) {
    return this.emailFunnelService.sendPreview({
      stepKey: dto.step_key,
      to: dto.to,
    });
  }
}
