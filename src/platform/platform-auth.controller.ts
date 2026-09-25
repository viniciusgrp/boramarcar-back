import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PlatformPassphraseLoginDto } from './dto/platform-ops.dto';
import { PlatformAdminsService } from './platform-admins.service';

@Controller('platform')
export class PlatformAuthController {
  constructor(private readonly platformAdminsService: PlatformAdminsService) {}

  @Post('login-passphrase')
  @HttpCode(200)
  @Throttle({ medium: { limit: 5, ttl: 60_000 } })
  loginWithPassphrase(@Body() dto: PlatformPassphraseLoginDto) {
    return this.platformAdminsService.loginWithPassphrase(dto.passphrase);
  }
}
