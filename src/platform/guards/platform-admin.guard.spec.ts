import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/types/authenticated-request';
import type { PlatformAdmin } from '../entities/platform-admin.entity';
import type { PlatformAdminsService } from '../platform-admins.service';
import { PlatformAdminGuard } from './platform-admin.guard';

function buildContext(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request as AuthenticatedRequest,
    }),
  } as unknown as ExecutionContext;
}

describe('PlatformAdminGuard', () => {
  const platformAdmin: PlatformAdmin = {
    id: 'pa-1',
    user_id: 'user-1',
    role: 'PARTNER_VIEWER',
    name: 'Sócio',
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  it('rejects when request has no authenticated user', async () => {
    const service = {
      findActiveByUserId: jest.fn(),
    } as unknown as PlatformAdminsService;
    const guard = new PlatformAdminGuard(service);
    const request: Partial<AuthenticatedRequest> = {};

    await expect(guard.canActivate(buildContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(service.findActiveByUserId).not.toHaveBeenCalled();
  });

  it('rejects when user is not an active platform admin', async () => {
    const service = {
      findActiveByUserId: jest.fn().mockResolvedValue(null),
    } as unknown as PlatformAdminsService;
    const guard = new PlatformAdminGuard(service);
    const request: Partial<AuthenticatedRequest> = {
      user: { id: 'user-1' } as AuthenticatedRequest['user'],
    };

    await expect(guard.canActivate(buildContext(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(service.findActiveByUserId).toHaveBeenCalledWith('user-1');
  });

  it('allows active platform admin and attaches to request', async () => {
    const service = {
      findActiveByUserId: jest.fn().mockResolvedValue(platformAdmin),
    } as unknown as PlatformAdminsService;
    const guard = new PlatformAdminGuard(service);
    const request: Partial<AuthenticatedRequest> = {
      user: { id: 'user-1' } as AuthenticatedRequest['user'],
    };

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(request.platformAdmin).toEqual(platformAdmin);
  });
});
