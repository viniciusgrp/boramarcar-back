export type StockMovementType =
  | 'PURCHASE_IN'
  | 'SALE_OUT'
  | 'INTERNAL_USE_OUT'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'RETURN_IN'
  | 'EXPIRED_OUT';

export const STOCK_MOVEMENT_TYPES_REQUIRING_REASON: readonly StockMovementType[] =
  ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'EXPIRED_OUT'];

export interface StockMovement {
  id: string;
  tenant_id: string;
  product_id: string;
  lot_id: string | null;
  type: StockMovementType;
  quantity: number;
  unit_cost: number | null;
  total_cost: number | null;
  reason: string | null;
  appointment_id: string | null;
  product_sale_id: string | null;
  professional_id: string | null;
  performed_by: string | null;
  created_at: string;
}

export interface StockMovementWithProduct extends StockMovement {
  productName: string;
}
