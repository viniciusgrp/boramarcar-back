import { NotFoundException } from '@nestjs/common';
import { TenantOpenGraphService } from './tenant-open-graph.service';

describe('TenantOpenGraphService', () => {
  it('throws when the slug does not exist', async () => {
    const service = new TenantOpenGraphService(
      { findBySlug: jest.fn().mockResolvedValue(null) } as never,
      { get: () => 'http://localhost:5173' } as never,
    );

    await expect(service.getOpenGraphPayload('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
