import { SupportAssistantService } from './support-assistant.service';
import type { TenantAccessContext } from '../../tenants/entities/tenant-access-context.entity';
import type { User } from '@supabase/supabase-js';

describe('SupportAssistantService', () => {
  it('reports disabled when the feature flag is off', async () => {
    const service = new SupportAssistantService(
      { isEnabled: () => false } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.getStatus(
        { tenant: { plan_tier: 'SOLO' } } as TenantAccessContext,
        { id: 'user-1' } as User,
      ),
    ).resolves.toMatchObject({ enabled: false, reason: 'disabled' });
  });
});
