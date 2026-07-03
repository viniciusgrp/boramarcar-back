export interface LoyaltySettings {
  tenant_id: string;
  is_active: boolean;
  points_per_currency: number;
  default_service_points: number;
  expiration_days: number | null;
  welcome_bonus: number;
  refund_points_on_no_show: boolean;
  updated_at: string;
}
