import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { APP_TIME_ZONE } from '../common/app-time-zone';
import { LoyaltyService } from './loyalty.service';

@Injectable()
export class LoyaltyExpirationService {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Cron('0 0 * * *', { timeZone: APP_TIME_ZONE })
  async handlePointsExpiration(): Promise<void> {
    await this.loyaltyService.expirePointsForAllTenants();
  }
}
