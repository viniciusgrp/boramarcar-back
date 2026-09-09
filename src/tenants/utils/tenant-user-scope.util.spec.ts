import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { TenantUser } from '../entities/tenant-user.entity';
import {
  assertProfessionalScope,
  assertProfessionalScopeForMutation,
  assertProfessionalSelfScope,
  resolveLinkedProfessionalId,
  resolveScopedProfessionalId,
} from './tenant-user-scope.util';

const EMPTY_PREFERENCES: TenantUser['preferences'] = {
  admin_theme_mode: 'light',
};

function buildUser(overrides: Partial<TenantUser>): TenantUser {
  return {
    id: 'tu-1',
    tenant_id: 'tenant-1',
    user_id: 'user-1',
    role: 'OWNER',
    professional_id: null,
    preferences: EMPTY_PREFERENCES,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('tenant-user-scope.util', () => {
  it('trims linked professional id', () => {
    expect(
      resolveLinkedProfessionalId(buildUser({ professional_id: '  pro-1  ' })),
    ).toBe('pro-1');
    expect(resolveLinkedProfessionalId(buildUser({ professional_id: null }))).toBe(
      null,
    );
  });

  it('does not scope OWNER or ADMIN', () => {
    expect(resolveScopedProfessionalId(buildUser({ role: 'OWNER' }))).toBeUndefined();
    expect(resolveScopedProfessionalId(buildUser({ role: 'ADMIN' }))).toBeUndefined();
  });

  it('scopes PROFESSIONAL to their profile and rejects missing link', () => {
    expect(
      resolveScopedProfessionalId(
        buildUser({ role: 'PROFESSIONAL', professional_id: 'pro-1' }),
      ),
    ).toBe('pro-1');

    expect(() =>
      resolveScopedProfessionalId(
        buildUser({ role: 'PROFESSIONAL', professional_id: null }),
      ),
    ).toThrow(BadRequestException);
  });

  it('allows unscoped users to read or mutate any professional', () => {
    expect(() => assertProfessionalScope(undefined, 'pro-other')).not.toThrow();
    expect(() =>
      assertProfessionalScopeForMutation(undefined, 'pro-other'),
    ).not.toThrow();
    expect(() => assertProfessionalSelfScope(undefined, 'pro-other')).not.toThrow();
  });

  it('blocks a professional from reading or mutating another profile', () => {
    expect(() => assertProfessionalScope('pro-1', 'pro-2')).toThrow(
      ForbiddenException,
    );
    expect(() => assertProfessionalScopeForMutation('pro-1', 'pro-2')).toThrow(
      ForbiddenException,
    );
    expect(() => assertProfessionalSelfScope('pro-1', 'pro-2')).toThrow(
      ForbiddenException,
    );
  });

  it('allows a professional to access their own resource', () => {
    expect(() => assertProfessionalScope('pro-1', 'pro-1')).not.toThrow();
    expect(() => assertProfessionalScopeForMutation('pro-1', 'pro-1')).not.toThrow();
    expect(() => assertProfessionalSelfScope('pro-1', 'pro-1')).not.toThrow();
  });
});
