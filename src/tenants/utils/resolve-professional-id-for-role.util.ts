import { BadRequestException } from '@nestjs/common';
import type { UserRole } from '../entities/user-role.type';

/**
 * Resolves the professional profile link for a team role.
 * - PROFESSIONAL: required
 * - ADMIN (Gerente): optional, so managers can also receive appointments
 * - OWNER: not set via this path (separate owner setup flow)
 */
export function resolveProfessionalIdForRole(
  role: UserRole,
  professionalId?: string | null,
): string | null {
  if (role === 'OWNER') {
    return null;
  }

  const trimmed = professionalId?.trim() || null;

  if (role === 'PROFESSIONAL') {
    if (!trimmed) {
      throw new BadRequestException(
        'Informe o profissional vinculado para a função de colaborador.',
      );
    }

    return trimmed;
  }

  if (role === 'ADMIN') {
    return trimmed;
  }

  return null;
}
