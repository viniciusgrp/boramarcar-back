/**
 * Welcome is immediate, but it must wait until the establishment email is
 * confirmed (`auth.users.email_confirmed_at`, same source as 5e73c11).
 *
 * Non-welcome steps are paused separately via eligibility `email_unconfirmed`
 * (non-final, no send row). If confirmation arrives after the due window,
 * normal due/stale rules apply on the next cron cycle.
 */
export function shouldDeferWelcomeUntilOwnerEmailConfirmed(params: {
  stepKey: string;
  ownerEmailConfirmed: boolean;
}): boolean {
  return params.stepKey === 'welcome' && !params.ownerEmailConfirmed;
}
