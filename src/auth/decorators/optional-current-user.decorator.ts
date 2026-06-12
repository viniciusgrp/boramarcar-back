import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import { AuthenticatedRequest } from '../types/authenticated-request';

export const OptionalCurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): User | undefined => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    return request.user;
  },
);
