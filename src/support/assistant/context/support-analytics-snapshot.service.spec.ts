import { SupportAnalyticsSnapshotService } from './support-analytics-snapshot.service';
import type { TenantAccessContext } from '../../../tenants/entities/tenant-access-context.entity';

describe('SupportAnalyticsSnapshotService', () => {
  it('returns an empty snapshot when the professional is not linked', async () => {
    const service = new SupportAnalyticsSnapshotService({} as never);
    const snapshot = await service.buildForContext({
      tenant: { id: 'tenant-1' },
      tenantUser: { role: 'PROFESSIONAL', professional_id: null },
    } as TenantAccessContext);

    expect(snapshot.emptyReason).toBe('professional_not_linked');
  });
});
