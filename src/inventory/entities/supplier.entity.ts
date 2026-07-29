export interface Supplier {
  id: string;
  tenant_id: string;
  name: string;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}
