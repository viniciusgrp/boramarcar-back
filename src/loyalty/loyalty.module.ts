import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { TenantsModule } from '../tenants/tenants.module';
import { LoyaltyExpirationService } from './loyalty-expiration.service';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';
import { ReferralService } from './referral.service';

@Module({
  imports: [AuthModule, TenantsModule, MailModule],
  controllers: [LoyaltyController],
  providers: [LoyaltyService, ReferralService, LoyaltyExpirationService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
