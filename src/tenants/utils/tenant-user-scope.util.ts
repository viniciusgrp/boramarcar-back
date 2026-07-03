import { BadRequestException, ForbiddenException } from '@nestjs/common';
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

export function assertProfessionalScope(
  scopedProfessionalId: string | undefined,
  resourceProfessionalId: string,
): void {
  if (!scopedProfessionalId) {
    return;
  }

  if (resourceProfessionalId !== scopedProfessionalId) {
    throw new ForbiddenException(
      'Você só pode acessar os próprios agendamentos.',
    );
  }
}

export function assertProfessionalScopeForMutation(
  scopedProfessionalId: string | undefined,
  targetProfessionalId: string,
): void {
  if (!scopedProfessionalId) {
    return;
  }

  if (targetProfessionalId !== scopedProfessionalId) {
    throw new ForbiddenException(
      'Você só pode criar agendamentos para o seu próprio perfil.',
    );
  }
}
