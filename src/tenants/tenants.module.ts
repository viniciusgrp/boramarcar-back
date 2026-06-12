import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantsController } from './tenants.controller';
import { TenantUsersController } from './tenant-users.controller';
import { TenantAccessGuard } from './guards/tenant-access.guard';
import { RolesGuard } from './guards/roles.guard';
import { TenantsService } from './tenants.service';
import { TenantUsersService } from './tenant-users.service';

@Module({
  imports: [AuthModule],
  controllers: [TenantsController, TenantUsersController],
  providers: [TenantsService, TenantUsersService, TenantAccessGuard, RolesGuard],
  exports: [TenantsService, TenantUsersService, TenantAccessGuard, RolesGuard],
})
export class TenantsModule {}
