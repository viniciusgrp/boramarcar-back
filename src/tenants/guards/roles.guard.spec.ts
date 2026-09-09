import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../../auth/types/authenticated-request';
import type { TenantAccessContext } from '../entities/tenant-access-context.entity';
import { RolesGuard } from './roles.guard';

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

describe('RolesGuard', () => {
  it('allows routes without required roles', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(buildContext({} as AuthenticatedRequest))).toBe(true);
  });

  it('allows the matching tenant role', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['OWNER', 'ADMIN']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const request = {
      tenantAccess: {
        tenantUser: { role: 'ADMIN' },
      } as TenantAccessContext,
    } as AuthenticatedRequest;

    expect(guard.canActivate(buildContext(request))).toBe(true);
  });

  it('rejects professionals on owner-only routes', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['OWNER', 'ADMIN']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const request = {
      tenantAccess: {
        tenantUser: { role: 'PROFESSIONAL' },
      } as TenantAccessContext,
    } as AuthenticatedRequest;

    expect(() => guard.canActivate(buildContext(request))).toThrow(
      ForbiddenException,
    );
  });
});
