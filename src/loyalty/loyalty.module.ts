import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';
import { LoyaltyExpirationService } from './loyalty-expiration.service';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';

@Module({
  imports: [AuthModule, TenantsModule],
  controllers: [LoyaltyController],
  providers: [LoyaltyService, LoyaltyExpirationService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
