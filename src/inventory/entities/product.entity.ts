export type ProductUnit = 'UN' | 'ML' | 'G' | 'KG' | 'L' | 'CX';

export const PRODUCT_UNITS: readonly ProductUnit[] = [
  'UN',
  'ML',
  'G',
  'KG',
  'L',
  'CX',
];

export interface Product {
  id: string;
  tenant_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  unit: ProductUnit;
  cost_price: number;
  sale_price: number;
  current_stock: number;
  min_stock_alert: number;
  track_lots: boolean;
  custom_commission_rate: number | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductWithAlerts extends Product {
  isLowStock: boolean;
  marginPercent: number | null;
  categoryName: string | null;
}

export interface ExpiringLotAlert {
  productId: string;
  productName: string;
  lotId: string;
  lotNumber: string | null;
  expiryDate: string;
  quantityRemaining: number;
}

export interface InventoryAlertsResponse {
  lowStockProducts: ProductWithAlerts[];
  expiringLots: ExpiringLotAlert[];
}
