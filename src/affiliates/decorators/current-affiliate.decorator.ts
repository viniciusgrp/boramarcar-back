import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/types/authenticated-request';
import type { Affiliate } from '../entities/affiliate.entity';

export const CurrentAffiliate = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Affiliate => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.affiliate) {
      throw new ForbiddenException(
        'Esta conta não está cadastrada no programa de parceiros.',
      );
    }

    return request.affiliate;
  },
);
