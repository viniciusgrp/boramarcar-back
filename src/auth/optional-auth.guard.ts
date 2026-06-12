import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthenticatedRequest } from './types/authenticated-request';

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      return true;
    }

    const token = authorization.slice('Bearer '.length).trim();

    if (!token) {
      return true;
    }

    const { data } =
      await this.supabaseService.getClient().auth.getUser(token);

    if (data.user) {
      request.user = data.user;
    }

    return true;
  }
}
