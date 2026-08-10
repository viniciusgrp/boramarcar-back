import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformAdminGuard } from './guards/platform-admin.guard';
import { PlatformAdminsService } from './platform-admins.service';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Module({
  imports: [AuthModule],
  controllers: [PlatformController],
  providers: [PlatformAdminsService, PlatformService, PlatformAdminGuard],
  exports: [PlatformAdminsService, PlatformAdminGuard],
})
export class PlatformModule {}
