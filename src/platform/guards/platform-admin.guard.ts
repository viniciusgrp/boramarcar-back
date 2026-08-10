import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/types/authenticated-request';
import { PlatformAdminsService } from '../platform-admins.service';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(
    private readonly platformAdminsService: PlatformAdminsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user?.id) {
      throw new UnauthorizedException('Missing or invalid authorization token');
    }

    const platformAdmin =
      await this.platformAdminsService.findActiveByUserId(user.id);

    if (!platformAdmin) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar este recurso.',
      );
    }

    request.platformAdmin = platformAdmin;
    return true;
  }
}
