export interface Customer {
  id: string;
  tenant_id: string;
  name: string;
  phone: string;
  email: string | null;
  points_balance: number;
  created_at: string;
  updated_at: string;
}
