import { createChainableQuery } from '../test-utils/supabase-mock';
import { BusinessHoursService } from './business-hours.service';

describe('BusinessHoursService', () => {
  it('loads hours for the tenant', async () => {
    const from = jest.fn(() =>
      createChainableQuery({
        data: [
          {
            id: 'bh-1',
            tenant_id: 'tenant-1',
            day_of_week: 1,
            open_time: '09:00',
            close_time: '18:00',
            is_closed: false,
          },
        ],
        error: null,
      }),
    );
    const service = new BusinessHoursService({
      getClient: () => ({ from }),
    } as never);

    const hours = await service.findAllByTenant('tenant-1');
    expect(from).toHaveBeenCalledWith('business_hours');
    expect(hours.length).toBeGreaterThan(0);
  });
});
