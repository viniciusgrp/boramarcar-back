export interface StripeConnectStatusResponse {
  accountId: string | null;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  isReady: boolean;
  onboardingRequired: boolean;
  applicationFeePercent: number;
  canOpenDashboard: boolean;
}

export interface StripeConnectOnboardingResponse {
  url: string;
}
