export interface LoyaltySettings {
  tenant_id: string;
  is_active: boolean;
  points_per_currency: number;
  expiration_days: number | null;
  welcome_bonus: number;
  updated_at: string;
}
