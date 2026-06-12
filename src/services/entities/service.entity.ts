export interface Service {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  requires_deposit: boolean;
  deposit_amount: number | null;
  custom_commission_rate: number | null;
  loyalty_points_earned: number;
  is_active: boolean;
}
