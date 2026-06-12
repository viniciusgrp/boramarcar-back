export interface BookingLoyaltyFeedback {
  isActive: boolean;
  estimatedCompletionPoints: number;
  welcomeBonusPoints: number;
  tenantSlug?: string;
  tenantName?: string;
  customerReferralCode?: string | null;
}
