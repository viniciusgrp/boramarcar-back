import type { AsaasOnboardingStep } from '../utils/asaas-onboarding-steps.util';

export interface AsaasAccountStatusResponse {
  accountId: string | null;
  walletId: string | null;
  accountStatus: string | null;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  isReady: boolean;
  /** True when the subaccount can receive appointment deposits. */
  canChargeDeposits: boolean;
  onboardingRequired: boolean;
  applicationFeePercent: number;
  canOpenDashboard: boolean;
  onboardingTitle?: string;
  onboardingSteps?: AsaasOnboardingStep[];
}
