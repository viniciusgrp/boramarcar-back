export function buildTeamInviteAcceptUrl(
  frontendOrigin: string,
  token: string,
): string {
  const origin = frontendOrigin.trim().replace(/\/+$/, '');
  return `${origin}/admin/login?invite=${encodeURIComponent(token)}`;
}
