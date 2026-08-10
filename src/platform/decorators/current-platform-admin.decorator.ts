import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/types/authenticated-request';
import type { PlatformAdmin } from '../entities/platform-admin.entity';

export const CurrentPlatformAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PlatformAdmin => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.platformAdmin) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar este recurso.',
      );
    }

    return request.platformAdmin;
  },
);
