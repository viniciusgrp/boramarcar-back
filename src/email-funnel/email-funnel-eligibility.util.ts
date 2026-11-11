import type {
  EmailFunnelDueStatus,
  EmailFunnelEligibility,
  EmailFunnelSkipReason,
} from './email-funnel.types';

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

  // Allow last-day-of-trial steps (offset 0 before trial end) even after trial technically ended
  // This ensures trial_last_day sends at 10h even if trial_ends_at was earlier (e.g. 08h)
  if (params.trialEnded && !params.isPostTrialStep && !params.isLastDayOfTrialStep) {
    return 'trial_ended';
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

  const dueStatus =
    params.dueStatus ?? (params.isDue === true ? 'due' : 'not_due');

  if (dueStatus === 'not_due') {
    return 'not_due';
  }

  if (dueStatus === 'stale') {
    return 'stale';
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
  'not_due' | 'inactive_step' | 'already_processed'
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
