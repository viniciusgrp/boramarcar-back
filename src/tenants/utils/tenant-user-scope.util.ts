import { BadRequestException } from '@nestjs/common';
import type { TenantUser } from '../entities/tenant-user.entity';

export function resolveScopedProfessionalId(
  tenantUser: TenantUser,
): string | undefined {
  if (tenantUser.role !== 'PROFESSIONAL') {
    return undefined;
  }

  if (!tenantUser.professional_id) {
    throw new BadRequestException(
      'Sua conta profissional ainda não está vinculada a um perfil de atendimento.',
    );
  }

  return tenantUser.professional_id;
}
