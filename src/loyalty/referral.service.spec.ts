import { ReferralService } from './referral.service';
import type { Customer } from './entities/customer.entity';

describe('ReferralService', () => {
  it('returns customers that already have a referral code', async () => {
    const service = new ReferralService({} as never, {} as never);
    const customer = { id: 'cust-1', referral_code: 'ABC123' } as Customer;

    await expect(
      service.ensureReferralCodeForCustomer('tenant-1', customer),
    ).resolves.toBe(customer);
  });
});
