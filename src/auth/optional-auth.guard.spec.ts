import type { ExecutionContext } from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import { OptionalAuthGuard } from './optional-auth.guard';
import type { AuthenticatedRequest } from './types/authenticated-request';
import { createSupabaseServiceMock } from '../test-utils/supabase-mock';

function buildContext(
  request: Partial<AuthenticatedRequest>,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request as AuthenticatedRequest,
    }),
  } as unknown as ExecutionContext;
}

describe('OptionalAuthGuard', () => {
  it('allows requests without a Bearer token', async () => {
    const { getClient } = createSupabaseServiceMock();
    const guard = new OptionalAuthGuard({ getClient } as never);
    const request = { headers: {} } as AuthenticatedRequest;

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('allows empty Bearer tokens without calling Auth', async () => {
    const authGetUser = jest.fn();
    const { getClient } = createSupabaseServiceMock({ authGetUser });
    const guard = new OptionalAuthGuard({ getClient } as never);
    const request = {
      headers: { authorization: 'Bearer ' },
    } as AuthenticatedRequest;

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(authGetUser).not.toHaveBeenCalled();
  });

  it('attaches the user when the token is valid', async () => {
    const user = { id: 'user-1' } as User;
    const authGetUser = jest.fn(async () => ({
      data: { user },
      error: null,
    }));
    const { getClient } = createSupabaseServiceMock({ authGetUser });
    const guard = new OptionalAuthGuard({ getClient } as never);
    const request = {
      headers: { authorization: 'Bearer good' },
    } as AuthenticatedRequest;

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(request.user).toEqual(user);
  });
});
