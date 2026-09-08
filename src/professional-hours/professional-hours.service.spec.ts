import { createChainableQuery } from '../test-utils/supabase-mock';
import { ProfessionalHoursService } from './professional-hours.service';

describe('ProfessionalHoursService', () => {
  it('loads hours for a professional in the tenant', async () => {
    const from = jest.fn(() =>
      createChainableQuery({
        data: [
          {
            id: 'ph-1',
            tenant_id: 'tenant-1',
            professional_id: 'pro-1',
            day_of_week: 1,
            opening_time: '10:00:00',
            closing_time: '18:00:00',
            is_closed: false,
          },
        ],
        error: null,
      }),
    );
    const service = new ProfessionalHoursService(
      { getClient: () => ({ from }) } as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.findAllByProfessional('tenant-1', 'pro-1'),
    ).resolves.toHaveLength(1);
    expect(from).toHaveBeenCalledWith('professional_hours');
  });
});
