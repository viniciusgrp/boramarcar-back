import { ApiErrorEventsService } from './api-error-events.service';
import type { SupabaseService } from '../../supabase/supabase.service';

describe('ApiErrorEventsService', () => {
  it('inserts a sanitized row and swallows supabase errors', async () => {
    const insert = jest.fn().mockResolvedValue({
      error: { message: 'relation does not exist' },
    });
    const from = jest.fn().mockReturnValue({ insert });
    const supabaseService = {
      getClient: () => ({ from }),
    } as unknown as SupabaseService;

    const service = new ApiErrorEventsService(supabaseService);
    await expect(
      service.record({
        tenantId: '11111111-1111-4111-8111-111111111111',
        method: 'GET',
        path: '/tenants/me',
        statusCode: 500,
        message: 'boom',
      }),
    ).resolves.toBeUndefined();

    expect(from).toHaveBeenCalledWith('api_error_events');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: '11111111-1111-4111-8111-111111111111',
        path: '/tenants/me',
        status_code: 500,
      }),
    );
  });
});
