export interface LoyaltyReward {
  id: string;
  tenant_id: string;
  title: string;
  points_cost: number;
  service_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
