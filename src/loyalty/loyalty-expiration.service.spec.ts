import { LoyaltyExpirationService } from './loyalty-expiration.service';
import type { LoyaltyService } from './loyalty.service';

describe('LoyaltyExpirationService', () => {
  it('delegates daily expiration to LoyaltyService', async () => {
    const loyaltyService = {
      expirePointsForAllTenants: jest.fn().mockResolvedValue(undefined),
    } as unknown as LoyaltyService;

    await new LoyaltyExpirationService(loyaltyService).handlePointsExpiration();

    expect(loyaltyService.expirePointsForAllTenants).toHaveBeenCalledTimes(1);
  });
});
