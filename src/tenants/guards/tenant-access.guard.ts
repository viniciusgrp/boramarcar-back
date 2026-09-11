import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { isProductionAppEnv } from '../../common/app-env.util';
import { AuthenticatedRequest } from '../../auth/types/authenticated-request';
import { ALLOW_INACTIVE_TENANT_ACCESS_KEY } from '../decorators/allow-inactive-tenant-access.decorator';
import { SKIP_TENANT_ACCESS_CHECK_KEY } from '../decorators/skip-tenant-access-check.decorator';
import { TenantsService } from '../tenants.service';
import {
  hasTenantAdminAccess,
  TRIAL_EXPIRED_MESSAGE,
} from '../utils/tenant-access.util';
import { requiresEstablishmentEmailVerification } from '../../security/establishment-email-verification.util';
import { ESTABLISHMENT_EMAIL_NOT_CONFIRMED_MESSAGE } from '../../security/signup-security.messages';

@Injectable()
export class TenantAccessGuard implements CanActivate {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
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

    if (
      isProductionAppEnv(this.configService.get<string>('APP_ENV')) &&
      requiresEstablishmentEmailVerification(request.user)
    ) {
      throw new ForbiddenException(ESTABLISHMENT_EMAIL_NOT_CONFIRMED_MESSAGE);
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
