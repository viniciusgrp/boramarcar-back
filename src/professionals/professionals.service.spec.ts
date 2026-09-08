import { ForbiddenException } from '@nestjs/common';
import { ProfessionalsService } from './professionals.service';

describe('ProfessionalsService', () => {
  it('enforces the Solo professional limit', async () => {
    const service = new ProfessionalsService({} as never, {} as never);
    jest
      .spyOn(service, 'countActiveByTenant')
      .mockResolvedValue(1);

    await expect(
      service.assertCanCreateProfessional('tenant-1', 'SOLO', true),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
