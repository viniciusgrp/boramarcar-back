import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from '../../auth/types/authenticated-request';
import { ALLOW_INACTIVE_TENANT_ACCESS_KEY } from '../decorators/allow-inactive-tenant-access.decorator';
import { SKIP_TENANT_ACCESS_CHECK_KEY } from '../decorators/skip-tenant-access-check.decorator';
import { TenantsService } from '../tenants.service';
import {
  hasTenantAdminAccess,
  TRIAL_EXPIRED_MESSAGE,
} from '../utils/tenant-access.util';

@Injectable()
export class TenantAccessGuard implements CanActivate {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skipCheck = this.reflector.getAllAndOverride<boolean>(
      SKIP_TENANT_ACCESS_CHECK_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipCheck) {
      return true;
    }

    const allowInactive = this.reflector.getAllAndOverride<boolean>(
      ALLOW_INACTIVE_TENANT_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const tenantAccess = await this.tenantsService.findAccessContextByUserId(
      request.user.id,
    );

    if (!tenantAccess) {
      throw new ForbiddenException(TRIAL_EXPIRED_MESSAGE);
    }

    if (!allowInactive && !hasTenantAdminAccess(tenantAccess.tenant)) {
      throw new ForbiddenException(TRIAL_EXPIRED_MESSAGE);
    }

    request.tenantAccess = tenantAccess;

    return true;
  }
}
