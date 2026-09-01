import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { AffiliatesService } from './affiliates.service';

@Injectable()
export class AffiliateGuard implements CanActivate {
  constructor(private readonly affiliatesService: AffiliatesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user?.id) {
      throw new UnauthorizedException('Missing or invalid authorization token');
    }

    const affiliate = await this.affiliatesService.findByAuthUserId(user.id);

    if (!affiliate) {
      throw new ForbiddenException(
        'Esta conta não está cadastrada no programa de parceiros.',
      );
    }

    request.affiliate = affiliate;
    return true;
  }
}
