import { createChainableQuery } from '../test-utils/supabase-mock';
import { ProfessionalAbsencesService } from './professional-absences.service';

describe('ProfessionalAbsencesService', () => {
  it('lists absences for a professional in the tenant', async () => {
    const from = jest.fn(() =>
      createChainableQuery({
        data: [
          {
            id: 'abs-1',
            tenant_id: 'tenant-1',
            professional_id: 'pro-1',
            created_at: '2026-09-01T00:00:00.000Z',
            reason: null,
          },
        ],
        error: null,
      }),
    );
    const service = new ProfessionalAbsencesService({
      getClient: () => ({ from }),
    } as never);

    await expect(
      service.findAllByProfessional('tenant-1', 'pro-1'),
    ).resolves.toHaveLength(1);
  });
});
