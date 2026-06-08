import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LoyaltyService } from './loyalty.service';

@Injectable()
export class LoyaltyExpirationService {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Cron('0 0 * * *')
  async handlePointsExpiration(): Promise<void> {
    await this.loyaltyService.expirePointsForAllTenants();
  }
}
