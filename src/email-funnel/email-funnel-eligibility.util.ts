import type {
  EmailFunnelDueStatus,
  EmailFunnelEligibility,
  EmailFunnelSkipReason,
} from './email-funnel.types';

/**
 * Eligibility order (must stay stable; covered by unit tests):
 * 1. already_processed / inactive / opted_out / paid
 * 2. not_due — before any condition that would write a final skip
 * 3. trial_ended (except post-trial / last-day steps)
 * 4. stale — if the due window already expired (incl. while waiting for email confirm)
 * 5. email_unconfirmed — non-welcome steps only; non-final (no send row)
 * 6. setup_complete / condition_not_met
 * 7. no_email
 * 8. send
 *
 * Decision if the owner confirms after the due window: follow normal due/stale
 * rules. A step that went stale while unconfirmed is recorded as `stale` on the
 * next cron cycle; it is not reopened. Steps still `due` resume and may send.
 */
export function resolveEmailFunnelEligibility(params: {
  isActive: boolean;
  optedOut: boolean;
  subscriptionStatus: string;
  trialEnded: boolean;
  skipIfSetupComplete: boolean;
  hasService: boolean;
  hasBusinessHours: boolean;
  alreadyProcessed: boolean;
  /** @deprecated Prefer dueStatus. Kept for call sites that only know due/not-due. */
  isDue?: boolean;
  dueStatus?: EmailFunnelDueStatus;
  hasRecipientEmail: boolean;
  sendOnlyIf: string | null;
  hasBookingLinkShared: boolean;
  hasPublicBooking: boolean;
  isPostTrialStep: boolean;
  isLastDayOfTrialStep: boolean;
  /** Same confirmation source as welcome (`auth.users.email_confirmed_at`). */
  ownerEmailConfirmed?: boolean;
  /** Welcome keeps its own gate; other steps pause via `email_unconfirmed`. */
  stepKey?: string;
}): EmailFunnelEligibility {
  if (params.alreadyProcessed) {
    return 'already_processed';
  }

  if (!params.isActive) {
    return 'inactive_step';
  }

  if (params.optedOut) {
    return 'opted_out';
  }

  if (params.subscriptionStatus === 'ACTIVE') {
    return 'paid';
  }

  const dueStatus =
    params.dueStatus ?? (params.isDue === true ? 'due' : 'not_due');

  if (dueStatus === 'not_due') {
    return 'not_due';
  }

  // Allow last-day-of-trial steps (offset 0 before trial end) even after trial technically ended
  // This ensures trial_last_day sends at 10h even if trial_ends_at was earlier (e.g. 08h)
  if (params.trialEnded && !params.isPostTrialStep && !params.isLastDayOfTrialStep) {
    return 'trial_ended';
  }

  if (dueStatus === 'stale') {
    return 'stale';
  }

  const isWelcome = params.stepKey === 'welcome';
  if (
    !isWelcome &&
    params.ownerEmailConfirmed === false
  ) {
    return 'email_unconfirmed';
  }

  if (
    params.skipIfSetupComplete &&
    params.hasService &&
    params.hasBusinessHours
  ) {
    return 'setup_complete';
  }

  if (params.sendOnlyIf === 'setup_complete_and_not_shared') {
    if (
      !params.hasService ||
      !params.hasBusinessHours ||
      params.hasBookingLinkShared
    ) {
      return 'condition_not_met';
    }
  }

  if (params.sendOnlyIf === 'no_public_booking') {
    if (!params.hasService || !params.hasBusinessHours || params.hasPublicBooking) {
      return 'condition_not_met';
    }
  }

  if (!params.hasRecipientEmail) {
    return 'no_email';
  }

  return 'send';
}

export function shouldRecordSkip(
  eligibility: EmailFunnelEligibility,
): eligibility is Exclude<
  EmailFunnelSkipReason,
  'not_due' | 'inactive_step' | 'already_processed' | 'email_unconfirmed'
> {
  return (
    eligibility === 'paid' ||
    eligibility === 'setup_complete' ||
    eligibility === 'opted_out' ||
    eligibility === 'no_email' ||
    eligibility === 'trial_ended' ||
    eligibility === 'condition_not_met' ||
    eligibility === 'stale'
  );
}
