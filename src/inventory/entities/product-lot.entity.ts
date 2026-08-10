export interface ProductLot {
  id: string;
  tenant_id: string;
  product_id: string;
  supplier_id: string | null;
  lot_number: string | null;
  expiry_date: string | null;
  unit_cost: number;
  quantity_received: number;
  quantity_remaining: number;
  received_at: string;
  created_at: string;
}
