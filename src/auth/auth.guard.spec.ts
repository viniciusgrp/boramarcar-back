import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import { AuthGuard } from './auth.guard';
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

describe('AuthGuard', () => {
  it('rejects missing or empty Bearer tokens', async () => {
    const { getClient } = createSupabaseServiceMock();
    const guard = new AuthGuard({ getClient } as never);

    await expect(
      guard.canActivate(buildContext({ headers: {} } as AuthenticatedRequest)),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(
      guard.canActivate(
        buildContext({
          headers: { authorization: 'Bearer ' },
        } as AuthenticatedRequest),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects invalid tokens from Supabase Auth', async () => {
    const authGetUser = jest.fn(async () => ({
      data: { user: null },
      error: { message: 'expired' },
    }));
    const { getClient } = createSupabaseServiceMock({ authGetUser });
    const guard = new AuthGuard({ getClient } as never);
    const request = {
      headers: { authorization: 'Bearer bad-token' },
    } as AuthenticatedRequest;

    await expect(guard.canActivate(buildContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches the authenticated user on success', async () => {
    const user = { id: 'user-1' } as User;
    const authGetUser = jest.fn(async () => ({
      data: { user },
      error: null,
    }));
    const { getClient } = createSupabaseServiceMock({ authGetUser });
    const guard = new AuthGuard({ getClient } as never);
    const request = {
      headers: { authorization: 'Bearer valid-token' },
    } as AuthenticatedRequest;

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(request.user).toEqual(user);
    expect(authGetUser).toHaveBeenCalledWith('valid-token');
  });
});
