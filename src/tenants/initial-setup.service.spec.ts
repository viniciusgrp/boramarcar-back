import { NotFoundException } from '@nestjs/common';
import { InitialSetupService } from './initial-setup.service';

describe('InitialSetupService', () => {
  it('rejects users without a tenant', async () => {
    const tenantsService = {
      findAccessContextByUserId: jest.fn().mockResolvedValue(null),
    };
    const service = new InitialSetupService({} as never, tenantsService as never);

    await expect(service.getStatusForUser('user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
