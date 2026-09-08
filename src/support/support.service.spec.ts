import { BadRequestException } from '@nestjs/common';
import { SupportService } from './support.service';
import type { TenantAccessContext } from '../tenants/entities/tenant-access-context.entity';

describe('SupportService', () => {
  it('requires a message body', async () => {
    const service = new SupportService(
      { isConfigured: () => true } as never,
      { get: () => 'support@test.com' } as never,
    );

    await expect(
      service.sendRequest(
        { tenant: { name: 'Studio' }, tenantUser: { role: 'OWNER' } } as TenantAccessContext,
        { name: 'Ana', email: 'ana@test.com', subject: 'Ajuda', message: '  ' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
