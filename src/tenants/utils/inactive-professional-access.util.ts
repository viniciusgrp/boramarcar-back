import type { UserRole } from '../entities/user-role.type';

/**
 * Panel access when the membership is linked to a professional profile.
 * Temporary pause (is_active=false) keeps panel access.
 * Archive (deleted_at set) blocks non-owner roles.
 * OWNER always keeps access.
 */
export function canAccessPanelWithLinkedProfessional(
  role: UserRole,
  linkedProfessionalIsArchived: boolean | null,
): boolean {
  if (linkedProfessionalIsArchived !== true) {
    return true;
  }

  return role === 'OWNER';
}

/** Non-owner memberships are removed when the linked professional is archived. */
export function shouldRevokePanelMembershipOnProfessionalArchive(
  role: UserRole,
): boolean {
  return role !== 'OWNER';
}
