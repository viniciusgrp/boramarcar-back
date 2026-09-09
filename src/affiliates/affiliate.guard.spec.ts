import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { AffiliateGuard } from './affiliate.guard';
import type { AffiliatesService } from './affiliates.service';
import type { Affiliate } from './entities/affiliate.entity';

function buildContext(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request as AuthenticatedRequest,
    }),
  } as unknown as ExecutionContext;
}

describe('AffiliateGuard', () => {
  it('rejects unauthenticated requests', async () => {
    const guard = new AffiliateGuard({ findByAuthUserId: jest.fn() } as unknown as AffiliatesService);

    await expect(guard.canActivate(buildContext({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects users who are not affiliates', async () => {
    const affiliatesService = {
      findByAuthUserId: jest.fn().mockResolvedValue(null),
    } as unknown as AffiliatesService;
    const guard = new AffiliateGuard(affiliatesService);
    const request = { user: { id: 'user-1' } } as AuthenticatedRequest;

    await expect(guard.canActivate(buildContext(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('attaches the affiliate on success', async () => {
    const affiliate = { id: 'aff-1' } as Affiliate;
    const affiliatesService = {
      findByAuthUserId: jest.fn().mockResolvedValue(affiliate),
    } as unknown as AffiliatesService;
    const request = { user: { id: 'user-1' } } as AuthenticatedRequest;

    await expect(
      new AffiliateGuard(affiliatesService).canActivate(buildContext(request)),
    ).resolves.toBe(true);
    expect(request.affiliate).toEqual(affiliate);
  });
});
