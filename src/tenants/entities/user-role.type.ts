export const USER_ROLES = ['OWNER', 'ADMIN', 'PROFESSIONAL'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  OWNER: 'Dono',
  ADMIN: 'Administrador',
  PROFESSIONAL: 'Colaborador',
};

export function isUserRole(value: string): value is UserRole {
  return USER_ROLES.includes(value as UserRole);
}

export function normalizeUserRole(value: unknown): UserRole {
  if (typeof value === 'string' && isUserRole(value)) {
    return value;
  }

  return 'PROFESSIONAL';
}
