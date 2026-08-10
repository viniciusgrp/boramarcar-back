export const PLATFORM_ADMIN_ROLES = ['PARTNER_VIEWER'] as const;

export type PlatformAdminRole = (typeof PLATFORM_ADMIN_ROLES)[number];

export const PLATFORM_ADMIN_ROLE_LABELS: Record<PlatformAdminRole, string> = {
  PARTNER_VIEWER: 'Sócio (somente leitura)',
};
