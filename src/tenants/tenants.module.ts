import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantsController } from './tenants.controller';
import { TenantAccessGuard } from './guards/tenant-access.guard';
import { TenantsService } from './tenants.service';

@Module({
  imports: [AuthModule],
  controllers: [TenantsController],
  providers: [TenantsService, TenantAccessGuard],
  exports: [TenantsService, TenantAccessGuard],
})
export class TenantsModule {}
