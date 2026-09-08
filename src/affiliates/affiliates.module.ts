import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AffiliateGuard } from './affiliate.guard';
import { AffiliatesController } from './affiliates.controller';
import { AffiliatesService } from './affiliates.service';

@Module({
  imports: [AuthModule],
  controllers: [AffiliatesController],
  providers: [AffiliatesService, AffiliateGuard],
  exports: [AffiliatesService],
})
export class AffiliatesModule {}
