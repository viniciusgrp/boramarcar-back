import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { NtfyModule } from '../notifications/ntfy.module';
import { TenantsController } from './tenants.controller';
import { TenantUsersController } from './tenant-users.controller';
import { TenantAccessGuard } from './guards/tenant-access.guard';
import { RolesGuard } from './guards/roles.guard';
import { TenantsService } from './tenants.service';
import { TenantUsersService } from './tenant-users.service';
import { InitialSetupService } from './initial-setup.service';
import { TenantOpenGraphService } from './tenant-open-graph.service';

@Module({
  imports: [AuthModule, MailModule, NtfyModule],
  controllers: [TenantsController, TenantUsersController],
  providers: [
    TenantsService,
    TenantUsersService,
    InitialSetupService,
    TenantOpenGraphService,
    TenantAccessGuard,
    RolesGuard,
  ],
  exports: [
    TenantsService,
    TenantUsersService,
    InitialSetupService,
    TenantAccessGuard,
    RolesGuard,
  ],
})
export class TenantsModule {}
