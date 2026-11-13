export interface AsaasAccountStatusResponse {
  accountId: string | null;
  walletId: string | null;
  accountStatus: string | null;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  isReady: boolean;
  onboardingRequired: boolean;
  applicationFeePercent: number;
  canOpenDashboard: boolean;
}
