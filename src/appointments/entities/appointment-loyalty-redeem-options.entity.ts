export interface AppointmentLoyaltyRedeemOptions {
  customerId: string | null;
  customerName: string;
  pointsBalance: number;
  isLoyaltyActive: boolean;
  alreadyPaidWithPoints: boolean;
  rewards: Array<{
    id: string;
    title: string;
    pointsCost: number;
    serviceId: string | null;
  }>;
  suggestedRewardId: string | null;
}
