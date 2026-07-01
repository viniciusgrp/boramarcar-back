export type LoyaltyRedemptionSource = 'booking' | 'standalone';

export interface LoyaltyRedemptionHistoryItem {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  reward_title: string;
  points: number;
  description: string;
  appointment_id: string | null;
  appointment_start_time: string | null;
  created_at: string;
  source: LoyaltyRedemptionSource;
}
