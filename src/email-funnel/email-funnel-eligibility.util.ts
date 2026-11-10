import type {
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
  isDue: boolean;
  hasRecipientEmail: boolean;
  sendOnlyIf: string | null;
  hasBookingLinkShared: boolean;
  hasPublicBooking: boolean;
  isPostTrialStep: boolean;
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

  if (params.trialEnded && !params.isPostTrialStep) {
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

  if (!params.isDue) {
    return 'not_due';
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
    eligibility === 'condition_not_met'
  );
}
