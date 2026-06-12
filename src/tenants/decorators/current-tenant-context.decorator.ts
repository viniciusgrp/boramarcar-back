import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/types/authenticated-request';
import type { TenantAccessContext } from '../entities/tenant-access-context.entity';

export const CurrentTenantContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantAccessContext => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.tenantAccess) {
      throw new Error('Tenant access context is missing on the request');
    }

    return request.tenantAccess;
  },
);
