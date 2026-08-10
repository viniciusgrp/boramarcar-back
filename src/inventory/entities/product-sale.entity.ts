export type ProductSaleStatus = 'COMPLETED' | 'CANCELLED';

export type ProductSalePaymentMethod = 'CASH' | 'CARD' | 'PIX' | 'OTHER';

export const PRODUCT_SALE_PAYMENT_METHODS: readonly ProductSalePaymentMethod[] =
  ['CASH', 'CARD', 'PIX', 'OTHER'];

export interface ProductSale {
  id: string;
  tenant_id: string;
  appointment_id: string | null;
  professional_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  payment_method: ProductSalePaymentMethod;
  subtotal_amount: number;
  discount_amount: number;
  total_amount: number;
  commission_amount: number;
  status: ProductSaleStatus;
  cash_register_id: string | null;
  created_at: string;
}

export interface ProductSaleItem {
  id: string;
  product_sale_id: string;
  tenant_id: string;
  product_id: string;
  lot_id: string | null;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  commission_percent: number;
  commission_amount: number;
  subtotal: number;
}

export interface ProductSaleItemWithProductName extends ProductSaleItem {
  productName: string;
}

export interface ProductSaleWithItems extends ProductSale {
  professionalName: string | null;
  items: ProductSaleItemWithProductName[];
}
