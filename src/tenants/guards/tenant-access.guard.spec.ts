import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../../auth/types/authenticated-request';
import { ALLOW_INACTIVE_TENANT_ACCESS_KEY } from '../decorators/allow-inactive-tenant-access.decorator';
import { SKIP_TENANT_ACCESS_CHECK_KEY } from '../decorators/skip-tenant-access-check.decorator';
import type { TenantAccessContext } from '../entities/tenant-access-context.entity';
import type { TenantsService } from '../tenants.service';
import { TRIAL_EXPIRED_MESSAGE } from '../utils/tenant-access.util';
import { TenantAccessGuard } from './tenant-access.guard';

function buildContext(
  request: Partial<AuthenticatedRequest>,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request as AuthenticatedRequest,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('TenantAccessGuard', () => {
  it('skips the check when the skip decorator is set', async () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => key === SKIP_TENANT_ACCESS_CHECK_KEY),
    } as unknown as Reflector;
    const tenantsService = {
      findAccessContextByUserId: jest.fn(),
    } as unknown as TenantsService;
    const guard = new TenantAccessGuard(tenantsService, reflector);

    await expect(
      guard.canActivate(buildContext({} as AuthenticatedRequest)),
    ).resolves.toBe(true);
    expect(tenantsService.findAccessContextByUserId).not.toHaveBeenCalled();
  });

  it('rejects missing authenticated users', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const guard = new TenantAccessGuard(
      { findAccessContextByUserId: jest.fn() } as unknown as TenantsService,
      reflector,
    );

    await expect(
      guard.canActivate(buildContext({} as AuthenticatedRequest)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects users pending establishment email confirmation', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const tenantsService = {
      findAccessContextByUserId: jest.fn(),
    } as unknown as TenantsService;
    const request = {
      user: {
        id: 'user-1',
        email_confirmed_at: null,
        user_metadata: { requires_email_verification: true },
      },
    } as unknown as AuthenticatedRequest;

    await expect(
      new TenantAccessGuard(tenantsService, reflector).canActivate(
        buildContext(request),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tenantsService.findAccessContextByUserId).not.toHaveBeenCalled();
  });

  it('rejects users without a tenant access context', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const tenantsService = {
      findAccessContextByUserId: jest.fn().mockResolvedValue(null),
    } as unknown as TenantsService;
    const guard = new TenantAccessGuard(tenantsService, reflector);
    const request = {
      user: { id: 'user-1' },
    } as AuthenticatedRequest;

    await expect(guard.canActivate(buildContext(request))).rejects.toThrow(
      TRIAL_EXPIRED_MESSAGE,
    );
  });

  it('rejects expired trial unless allowInactive is set', async () => {
    const access = {
      tenant: {
        subscription_status: 'INACTIVE',
        trial_ends_at: '2020-01-01T00:00:00.000Z',
      },
      tenantUser: { role: 'OWNER' },
    } as TenantAccessContext;

    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const tenantsService = {
      findAccessContextByUserId: jest.fn().mockResolvedValue(access),
    } as unknown as TenantsService;
    const request = {
      user: { id: 'user-1' },
    } as AuthenticatedRequest;

    await expect(
      new TenantAccessGuard(tenantsService, reflector).canActivate(
        buildContext(request),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const allowReflector = {
      getAllAndOverride: jest.fn(
        (key: string) => key === ALLOW_INACTIVE_TENANT_ACCESS_KEY,
      ),
    } as unknown as Reflector;

    await expect(
      new TenantAccessGuard(tenantsService, allowReflector).canActivate(
        buildContext(request),
      ),
    ).resolves.toBe(true);
    expect(request.tenantAccess).toEqual(access);
  });

  it('allows active subscriptions', async () => {
    const access = {
      tenant: {
        subscription_status: 'ACTIVE',
        trial_ends_at: null,
      },
      tenantUser: { role: 'ADMIN' },
    } as TenantAccessContext;
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const tenantsService = {
      findAccessContextByUserId: jest.fn().mockResolvedValue(access),
    } as unknown as TenantsService;
    const request = {
      user: { id: 'user-1' },
    } as AuthenticatedRequest;

    await expect(
      new TenantAccessGuard(tenantsService, reflector).canActivate(
        buildContext(request),
      ),
    ).resolves.toBe(true);
    expect(request.tenantAccess).toEqual(access);
  });
});
